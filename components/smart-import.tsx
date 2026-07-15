"use client";

import { AlertCircle, CheckCircle2, FileSpreadsheet, FileText, Image as ImageIcon, LoaderCircle, ScanLine, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { categories, frequencies, type BillingFrequency, type Subscription } from "@/lib/types";
import { candidateToSubscription, consolidateImportCandidates, parseDocumentText, parseImageReceiptText, parseSpreadsheetRows, subscriptionMatchKey, type SmartImportCandidate } from "@/lib/smart-import";
import { frequencyLabel, formatMoney } from "@/lib/calculations";

type AddInput = ReturnType<typeof candidateToSubscription>;

async function extractSpreadsheet(file: File, currency: string): Promise<SmartImportCandidate[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return workbook.SheetNames.flatMap((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    return parseSpreadsheetRows(rows, currency, `${file.name} · ${sheetName}`);
  });
}

async function extractPdf(file: File, currency: string, progress: (value: number, label: string) => void): Promise<SmartImportCandidate[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    progress(pageNumber / document.numPages, `Reading PDF page ${pageNumber} of ${document.numPages}`);
    const page = await document.getPage(pageNumber); const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}` : "").join(""));
  }
  return parseDocumentText(pages.join("\n"), currency, file.name);
}

async function extractImage(file: File, currency: string, progress: (value: number, label: string) => void): Promise<SmartImportCandidate[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, { logger: (message) => { if (typeof message.progress === "number") progress(message.progress, message.status === "recognizing text" ? "Reading text in image" : "Preparing image reader"); } });
  try { const result = await worker.recognize(file); return parseImageReceiptText(result.data.text, currency, file.name); }
  finally { await worker.terminate(); }
}

export function SmartImport({ currency, existingSubscriptions, onImport, onClose }: { currency: string; existingSubscriptions: Subscription[]; onImport: (items: AddInput[]) => void; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null); const [candidates, setCandidates] = useState<SmartImportCandidate[]>([]); const [phase, setPhase] = useState<"upload" | "processing" | "review">("upload");
  const [progress, setProgress] = useState(0); const [progressLabel, setProgressLabel] = useState(""); const [error, setError] = useState(""); const [dragging, setDragging] = useState(false);
  const processFiles = async (files: File[]) => {
    if (!files.length) return; setPhase("processing"); setError(""); setCandidates([]); const found: SmartImportCandidate[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]; if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is larger than the 20 MB limit.`); const extension = file.name.split(".").pop()?.toLowerCase(); setProgressLabel(`Opening ${file.name}`); setProgress(index / files.length);
        const report = (value: number, label: string) => { setProgress((index + value) / files.length); setProgressLabel(label); };
        let items: SmartImportCandidate[];
        if (["xlsx", "xls", "csv"].includes(extension ?? "")) items = await extractSpreadsheet(file, currency);
        else if (extension === "pdf" || file.type === "application/pdf") items = await extractPdf(file, currency, report);
        else if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension ?? "")) items = await extractImage(file, currency, report);
        else throw new Error(`${file.name} is not a supported file type.`);
        found.push(...items);
      }
      const existing = new Map(existingSubscriptions.map((item) => [subscriptionMatchKey(item.name), item.name]));
      const reviewed = consolidateImportCandidates(found).map((item) => { const match = existing.get(subscriptionMatchKey(item.name)); return match ? { ...item, warnings: [...item.warnings, `Charges will be added to the existing ${match} subscription.`] } : item; });
      setCandidates(reviewed); setProgress(1); setPhase("review");
      if (!reviewed.length) setError("No clear recurring subscriptions were found. Try a statement with merchant, amount, and billing-cycle details, or use a spreadsheet with Name and Price columns.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The files could not be read."); setPhase("upload"); }
  };
  const update = (id: string, patch: Partial<SmartImportCandidate>) => setCandidates((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const selected = candidates.filter((item) => item.selected && item.name.trim() && item.price > 0 && item.nextPaymentDate);
  const recordedPaymentCount = candidates.reduce((sum, item) => sum + (item.chargeCount ?? item.payments?.length ?? (item.paymentDate ? 1 : 0)), 0);
  const reviewHeading = `${candidates.length} subscription${candidates.length === 1 ? "" : "s"}${recordedPaymentCount ? ` and ${recordedPaymentCount} payment${recordedPaymentCount === 1 ? "" : "s"}` : ""} found`;
  return <div className="smart-import-body">
    {phase === "upload" && <>
      <button type="button" className={`import-dropzone ${dragging ? "dragging" : ""}`} onClick={() => fileRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void processFiles([...event.dataTransfer.files]); }}>
        <span className="import-icon"><ScanLine size={25} /></span><strong>Drop files here or choose files</strong><p>PDF statements, Excel or CSV sheets, and receipt screenshots</p><span className="file-types"><i><FileText size={14} /> PDF</i><i><FileSpreadsheet size={14} /> Excel</i><i><ImageIcon size={14} /> Images</i></span>
      </button>
      <input ref={fileRef} className="sr-only" type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={(event) => void processFiles([...(event.target.files ?? [])])} />
      <div className="privacy-note"><CheckCircle2 size={16} /><p><strong>Private by design</strong><span>Files are read in your browser and are not uploaded to SubTrack. You review every result before it is saved.</span></p></div>
      {error && <div className="import-error-box"><AlertCircle size={17} /><span>{error}</span></div>}
      <div className="import-start-actions"><button className="button secondary" onClick={onClose}>Cancel</button></div>
    </>}
    {phase === "processing" && <div className="import-processing"><span className="processing-icon"><LoaderCircle size={29} /></span><h3>Finding subscriptions…</h3><p>{progressLabel}</p><div className="progress-track"><span style={{ width: `${Math.max(6, progress * 100)}%` }} /></div><small>Images can take a little longer while text is recognized.</small></div>}
    {phase === "review" && <>
      <div className="review-summary"><div><span className="import-icon small"><CheckCircle2 size={18} /></span><div><strong>{reviewHeading}</strong><p>Repeated charges from the same provider are grouped into its payment history. Check the details before saving.</p></div></div><button className="button secondary compact" onClick={() => { setPhase("upload"); setCandidates([]); setError(""); }}>Choose other files</button></div>
      {error && <div className="import-error-box"><AlertCircle size={17} /><span>{error}</span></div>}
      <div className="candidate-list">{candidates.map((item) => <article className={`candidate-card ${!item.selected ? "unselected" : ""}`} key={item.id}>
        <label className="candidate-check"><input type="checkbox" checked={item.selected} onChange={(event) => update(item.id, { selected: event.target.checked })} /><span className={`confidence ${item.confidence}`}>{item.confidence} confidence</span></label>
        <button className="candidate-remove" aria-label={`Remove ${item.name}`} onClick={() => setCandidates((current) => current.filter((candidate) => candidate.id !== item.id))}><Trash2 size={16} /></button>
        <div className="candidate-fields"><label className="field"><span>Name</span><input value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} /></label><label className="field"><span>Price</span><div className="input-prefix"><span>{item.currency}</span><input type="number" min="0" step="0.01" value={item.price} onChange={(event) => update(item.id, { price: Number(event.target.value) })} /></div></label><label className="field"><span>Billing</span><select value={item.billingFrequency} onChange={(event) => update(item.id, { billingFrequency: event.target.value as BillingFrequency })}>{frequencies.map((frequency) => <option value={frequency} key={frequency}>{frequencyLabel(frequency)}</option>)}</select></label><label className="field"><span>Next payment</span><input type="date" value={item.nextPaymentDate} onChange={(event) => update(item.id, { nextPaymentDate: event.target.value })} /></label><label className="field"><span>Category</span><select value={item.category} onChange={(event) => update(item.id, { category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label></div>
        <div className="candidate-meta"><span>{formatMoney(item.price, item.currency)} · {item.chargeCount ? `${item.chargeCount} recorded charge${item.chargeCount === 1 ? "" : "s"} · ` : ""}{item.source}</span>{item.warnings.length > 0 && <span className="candidate-warning"><AlertCircle size={13} /> {item.warnings.join(" ")}</span>}</div>
      </article>)}</div>
      <div className="modal-actions import-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!selected.length} onClick={() => onImport(selected.map(candidateToSubscription))}><Upload size={17} /> Import {selected.length || ""} subscription{selected.length === 1 ? "" : "s"}</button></div>
    </>}
  </div>;
}
