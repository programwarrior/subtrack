"use client";

import { AlertCircle, CheckCircle2, FileSpreadsheet, FileText, Image as ImageIcon, LoaderCircle, ScanLine, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { categories, frequencies, type BillingFrequency, type Subscription } from "@/lib/types";
import { candidateToSubscription, consolidateImportCandidates, nextRenewalFromCharge, parseDocumentText, parseImageReceiptText, parseSpreadsheetRows, subscriptionMatchKey, type SmartImportCandidate } from "@/lib/smart-import";
import { classifyBankTransactions, parseBankStatementRows, parseBankStatementText, statementGroupToCandidate, type BankTransaction, type StatementMerchantGroup } from "@/lib/bank-statement";
import { frequencyLabel, formatMoney, todayDateOnly } from "@/lib/calculations";
import { reconcilePaymentPriceHistory } from "@/lib/payment-history";

type AddInput = ReturnType<typeof candidateToSubscription>;
type ExtractedFile = { candidates: SmartImportCandidate[]; transactions: BankTransaction[] };

function chargeDateSummary(item: SmartImportCandidate): string {
  const dates = [...new Set((item.payments ?? []).map((payment) => payment.paymentDate).filter(Boolean))].sort();
  if (!dates.length) return "";
  return dates.length === 1 ? `charged ${dates[0]}` : `charges ${dates[0]} – ${dates.at(-1)}`;
}

function validChargeDate(date: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayDateOnly(); }

async function extractSpreadsheet(file: File, currency: string): Promise<ExtractedFile> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const extracted = workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    const source = `${file.name} · ${sheetName}`; const transactions = parseBankStatementRows(rows, currency, source);
    return { candidates: transactions.length ? [] : parseSpreadsheetRows(rows, currency, source), transactions };
  });
  return { candidates: extracted.flatMap((item) => item.candidates), transactions: extracted.flatMap((item) => item.transactions) };
}

async function extractPdf(file: File, currency: string, progress: (value: number, label: string) => void): Promise<ExtractedFile> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    progress(pageNumber / document.numPages, `Reading PDF page ${pageNumber} of ${document.numPages}`);
    const page = await document.getPage(pageNumber); const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}` : "").join(""));
  }
  const text = pages.join("\n"); return { candidates: parseDocumentText(text, currency, file.name), transactions: parseBankStatementText(text, currency, file.name) };
}

async function extractImage(file: File, currency: string, progress: (value: number, label: string) => void): Promise<ExtractedFile> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, { logger: (message) => { if (typeof message.progress === "number") progress(message.progress, message.status === "recognizing text" ? "Reading text in image" : "Preparing image reader"); } });
  try { const result = await worker.recognize(file); return { candidates: parseImageReceiptText(result.data.text, currency, file.name), transactions: parseBankStatementText(result.data.text, currency, file.name) }; }
  finally { await worker.terminate(); }
}

export function SmartImport({ currency, existingSubscriptions, onImport, onClose }: { currency: string; existingSubscriptions: Subscription[]; onImport: (items: AddInput[]) => void; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null); const [candidates, setCandidates] = useState<SmartImportCandidate[]>([]); const [phase, setPhase] = useState<"upload" | "processing" | "review">("upload");
  const [statementGroups, setStatementGroups] = useState<StatementMerchantGroup[]>([]);
  const [progress, setProgress] = useState(0); const [progressLabel, setProgressLabel] = useState(""); const [error, setError] = useState(""); const [dragging, setDragging] = useState(false);
  const processFiles = async (files: File[]) => {
    if (!files.length) return; setPhase("processing"); setError(""); setCandidates([]); setStatementGroups([]); const found: SmartImportCandidate[] = []; const statementTransactions: BankTransaction[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]; if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is larger than the 20 MB limit.`); const extension = file.name.split(".").pop()?.toLowerCase(); setProgressLabel(`Opening file ${index + 1} of ${files.length}: ${file.name}`); setProgress(index / files.length);
        const report = (value: number, label: string) => { setProgress((index + value) / files.length); setProgressLabel(`${label} · file ${index + 1} of ${files.length}`); };
        let extracted: ExtractedFile;
        if (["xlsx", "xls", "csv"].includes(extension ?? "")) extracted = await extractSpreadsheet(file, currency);
        else if (extension === "pdf" || file.type === "application/pdf") extracted = await extractPdf(file, currency, report);
        else if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension ?? "")) extracted = await extractImage(file, currency, report);
        else throw new Error(`${file.name} is not a supported file type.`);
        const fileIdentity = `${file.name}:${file.size}:${file.lastModified}`;
        found.push(...extracted.candidates.map((item, itemIndex) => ({ ...item, sourceId: item.sourceId ?? `${fileIdentity}:${itemIndex}` })));
        statementTransactions.push(...extracted.transactions.map((transaction, transactionIndex) => ({ ...transaction, sourceId: `${fileIdentity}:statement:${transactionIndex}` })));
      }
      const groups = classifyBankTransactions(statementTransactions); const statementCandidates = groups.filter((group) => group.classification === "recurring").map(statementGroupToCandidate);
      const existing = new Map(existingSubscriptions.map((item) => [subscriptionMatchKey(item.name), item.name]));
      const reviewed = consolidateImportCandidates([...found, ...statementCandidates]).map((item) => { const match = existing.get(subscriptionMatchKey(item.name)); return match ? { ...item, warnings: [...item.warnings, `Charges will be added to the existing ${match} subscription.`] } : item; });
      setCandidates(reviewed); setStatementGroups(groups); setProgress(1); setPhase("review");
      if (!reviewed.length && !groups.length) setError("No clear transactions or recurring subscriptions were found. Try a statement with date, merchant, and amount details.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The files could not be read."); setPhase("upload"); }
  };
  const update = (id: string, patch: Partial<SmartImportCandidate>) => setCandidates((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const updateCharge = (candidateId: string, paymentId: string, patch: { paymentDate?: string; amount?: number }) => setCandidates((current) => current.map((item) => {
    if (item.id !== candidateId) return item;
    const payments = (item.payments ?? []).map((payment) => payment.id === paymentId ? { ...payment, ...patch } : payment);
    const dated = payments.filter((payment) => validChargeDate(payment.paymentDate)).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)); const latest = dated.at(-1);
    return { ...item, payments, price: latest?.amount ?? item.price, firstPaymentDate: dated.at(0)?.paymentDate, nextPaymentDate: latest ? nextRenewalFromCharge(latest.paymentDate, item.billingFrequency) : item.nextPaymentDate, priceHistory: reconcilePaymentPriceHistory([], dated) };
  }));
  const promoteStatementGroup = (group: StatementMerchantGroup) => {
    setCandidates((current) => consolidateImportCandidates([...current, statementGroupToCandidate(group)]));
    setStatementGroups((current) => current.map((item) => item.id === group.id ? { ...item, classification: "recurring", reason: "You marked this merchant as a subscription." } : item));
  };
  const selected = candidates.filter((item) => item.selected && item.name.trim() && item.price > 0 && item.nextPaymentDate && (item.payments ?? []).every((payment) => validChargeDate(payment.paymentDate)));
  const selectedWithMissingDates = candidates.some((item) => item.selected && (item.payments ?? []).some((payment) => !validChargeDate(payment.paymentDate)));
  const recordedPaymentCount = candidates.reduce((sum, item) => sum + (item.chargeCount ?? item.payments?.length ?? (item.paymentDate ? 1 : 0)), 0);
  const normalGroups = statementGroups.filter((group) => group.classification === "normal"); const reviewGroups = statementGroups.filter((group) => group.classification === "review");
  const reviewHeading = statementGroups.length ? `${candidates.length} likely subscription${candidates.length === 1 ? "" : "s"}, ${normalGroups.length} normal merchant${normalGroups.length === 1 ? "" : "s"}` : `${candidates.length} subscription${candidates.length === 1 ? "" : "s"}${recordedPaymentCount ? ` and ${recordedPaymentCount} payment${recordedPaymentCount === 1 ? "" : "s"}` : ""} found`;
  return <div className="smart-import-body">
    {phase === "upload" && <>
      <button type="button" className={`import-dropzone ${dragging ? "dragging" : ""}`} onClick={() => fileRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void processFiles([...event.dataTransfer.files]); }}>
        <span className="import-icon"><ScanLine size={25} /></span><strong>Drop files here or choose multiple files</strong><p>Upload bank statements, PDFs, spreadsheets, or receipt images.</p><span className="file-types"><i><FileText size={14} /> PDF</i><i><FileSpreadsheet size={14} /> Excel</i><i><ImageIcon size={14} /> Images</i></span>
      </button>
      <input ref={fileRef} className="sr-only" type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={(event) => void processFiles([...(event.target.files ?? [])])} />
      <div className="privacy-note"><CheckCircle2 size={16} /><p><strong>Private by design</strong><span>Files are read in your browser and are not uploaded to SubTrack. You review every result before it is saved.</span></p></div>
      {error && <div className="import-error-box"><AlertCircle size={17} /><span>{error}</span></div>}
      <div className="import-start-actions"><button className="button secondary" onClick={onClose}>Cancel</button></div>
    </>}
    {phase === "processing" && <div className="import-processing"><span className="processing-icon"><LoaderCircle size={29} /></span><h3>Analysing transactions…</h3><p>{progressLabel}</p><div className="progress-track"><span style={{ width: `${Math.max(6, progress * 100)}%` }} /></div><small>Files stay in your browser. Multiple monthly statements improve recurring-pattern accuracy.</small></div>}
    {phase === "review" && <>
      <div className="review-summary"><div><span className="import-icon small"><CheckCircle2 size={18} /></span><div><strong>{reviewHeading}</strong><p>Only selected subscriptions are saved. Normal spending remains private and is discarded when you close this review.</p></div></div><button className="button secondary compact" onClick={() => { setPhase("upload"); setCandidates([]); setStatementGroups([]); setError(""); }}>Choose other files</button></div>
      {error && <div className="import-error-box"><AlertCircle size={17} /><span>{error}</span></div>}
      {statementGroups.length > 0 && <section className="statement-analysis"><div className="statement-counts"><span className="recurring">{candidates.length} likely subscription{candidates.length === 1 ? "" : "s"}</span><span className="review">{reviewGroups.length} need review</span><span className="normal">{normalGroups.length} normal spending</span></div>{[...reviewGroups, ...normalGroups].length > 0 && <div className="statement-other-groups"><h3>Other statement activity</h3><p>Nothing below will be imported unless you explicitly mark it as a subscription.</p>{[...reviewGroups, ...normalGroups].map((group) => { const amounts = group.transactions.map((transaction) => transaction.amount); const min = Math.min(...amounts); const max = Math.max(...amounts); return <article className="statement-group" key={group.id}><div><strong>{group.merchant}</strong><span>{group.transactions.length} transaction{group.transactions.length === 1 ? "" : "s"} · {min === max ? formatMoney(min, group.currency) : `${formatMoney(min, group.currency)}–${formatMoney(max, group.currency)}`}</span><small>{group.reason}</small></div><em className={group.classification}>{group.classification === "review" ? "Needs review" : "Normal spending"}</em><button className="button secondary compact" onClick={() => promoteStatementGroup(group)}>Add as subscription</button></article>; })}</div>}</section>}
      {candidates.length > 0 && <h3 className="candidate-section-title">Subscriptions to import</h3>}
      <div className="candidate-list">{candidates.map((item) => <article className={`candidate-card ${!item.selected ? "unselected" : ""}`} key={item.id}>
        <label className="candidate-check"><input type="checkbox" checked={item.selected} onChange={(event) => update(item.id, { selected: event.target.checked })} /><span className={`confidence ${item.confidence}`}>{item.confidence} confidence</span></label>
        <button className="candidate-remove" aria-label={`Remove ${item.name}`} onClick={() => setCandidates((current) => current.filter((candidate) => candidate.id !== item.id))}><Trash2 size={16} /></button>
        <div className="candidate-fields"><label className="field"><span>Name</span><input value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} /></label><label className="field"><span>Price</span><div className="input-prefix"><span>{item.currency}</span><input type="number" min="0" step="0.01" value={item.price} onChange={(event) => update(item.id, { price: Number(event.target.value) })} /></div></label><label className="field"><span>Billing</span><select value={item.billingFrequency} onChange={(event) => update(item.id, { billingFrequency: event.target.value as BillingFrequency })}>{frequencies.map((frequency) => <option value={frequency} key={frequency}>{frequencyLabel(frequency)}</option>)}</select></label><label className="field"><span>Next payment</span><input type="date" value={item.nextPaymentDate} onChange={(event) => update(item.id, { nextPaymentDate: event.target.value })} /></label><label className="field"><span>Category</span><select value={item.category} onChange={(event) => update(item.id, { category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label></div>
        {!!item.payments?.length && <div className="candidate-charges"><strong>Recorded charges</strong>{item.payments.map((payment, index) => <div className="candidate-charge" key={payment.id}><span>Charge {index + 1}<small>{payment.note?.replace(/^Imported from /, "")}</small></span><label className="field"><span>Charge date</span><input type="date" max={todayDateOnly()} required className={!validChargeDate(payment.paymentDate) ? "invalid" : ""} value={payment.paymentDate} onChange={(event) => updateCharge(item.id, payment.id, { paymentDate: event.target.value })} />{!validChargeDate(payment.paymentDate) && <small className="error">Choose the date shown in this image</small>}</label><label className="field"><span>Amount</span><div className="input-prefix"><span>{item.currency}</span><input type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => updateCharge(item.id, payment.id, { amount: Number(event.target.value) })} /></div></label></div>)}</div>}
        <div className="candidate-meta"><span>{formatMoney(item.price, item.currency)} · {item.chargeCount ? `${item.chargeCount} recorded charge${item.chargeCount === 1 ? "" : "s"} · ${chargeDateSummary(item)} · ` : ""}{item.source}</span>{item.warnings.length > 0 && <span className="candidate-warning"><AlertCircle size={13} /> {item.warnings.join(" ")}</span>}</div>
      </article>)}</div>
      {selectedWithMissingDates && <div className="import-error-box"><AlertCircle size={17} /><span>Enter the missing charge date for each image before importing. SubTrack will no longer replace unread dates with today.</span></div>}
      <div className="modal-actions import-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!selected.length || selectedWithMissingDates} onClick={() => onImport(selected.map(candidateToSubscription))}><Upload size={17} /> Import {selected.length || ""} subscription{selected.length === 1 ? "" : "s"}</button></div>
    </>}
  </div>;
}
