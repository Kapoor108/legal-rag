import React, { useState } from "react";
import { 
  FileText, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Upload, 
  GitBranch, 
  BookOpen, 
  Calendar, 
  User, 
  Check, 
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
  File
} from "lucide-react";
import { LegalDocument, LegalRelationship } from "../types";

export interface BatchItem {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'parsing' | 'uploading' | 'completed' | 'failed';
  error?: string;
  category?: "Act" | "Court Judgment" | "POV/Commentary" | "Tax Document";
  citation?: string;
}

interface CorpusManagerProps {
  documents: LegalDocument[];
  relationships: LegalRelationship[];
  onUploadDocument: (doc: any) => Promise<void>;
  onAddRelationship: (rel: any) => Promise<void>;
  selectedDocId: string | null;
  setSelectedDocId: (id: string | null) => void;
}

export default function CorpusManager({
  documents,
  relationships,
  onUploadDocument,
  onAddRelationship,
  selectedDocId,
  setSelectedDocId
}: CorpusManagerProps) {
  const [activeTab, setActiveTab] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  
  // Batch upload states
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const batchFilesRef = React.useRef<Record<string, File>>({});
  
  // Form states
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<"Act" | "Court Judgment" | "POV/Commentary" | "Tax Document">("Act");
  const [newCitation, setNewCitation] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newRawPages, setNewRawPages] = useState(""); // separated by ---PAGE---
  
  // Relationship form states
  const [isLinking, setIsLinking] = useState(false);
  const [relSource, setRelSource] = useState("");
  const [relTarget, setRelTarget] = useState("");
  const [relType, setRelType] = useState<"cites" | "interprets" | "supersedes" | "discusses">("cites");
  const [relDesc, setRelDesc] = useState("");

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const categories = ["All", "Act", "Court Judgment", "Tax Document", "POV/Commentary"];
  
  const filteredDocs = activeTab === "All" 
    ? documents 
    : documents.filter(doc => doc.category === activeTab);

  const selectedDoc = documents.find(doc => doc.id === selectedDocId);

  // Relationships centered around the selected document
  const relatedFrom = relationships.filter(rel => rel.sourceId === selectedDocId);
  const relatedTo = relationships.filter(rel => rel.targetId === selectedDocId);

  const handleDocumentSelect = (id: string) => {
    setSelectedDocId(id);
    setCurrentPage(1);
  };

  const autoDetectAndPopulate = (fileName: string, text: string) => {
    // 1. Process title
    const titleClean = fileName.replace(/\.[^/.]+$/, "");
    setNewTitle(titleClean);

    // 2. Process category guess
    const lowerName = fileName.toLowerCase();
    const lowerText = text.toLowerCase();
    let guessedCategory: "Act" | "Court Judgment" | "Tax Document" | "POV/Commentary" = "Tax Document";
    
    if (lowerName.includes("court") || lowerName.includes("judgment") || lowerName.includes(" vs ") || lowerName.includes(" v. ") || lowerText.includes("supreme court") || lowerText.includes("district court")) {
      guessedCategory = "Court Judgment";
    } else if (lowerName.includes("act") || lowerName.includes("statute") || lowerName.includes("irc") || lowerName.includes("section") || lowerText.includes("statutory") || lowerText.includes("congress")) {
      guessedCategory = "Act";
    } else if (lowerName.includes("commentary") || lowerName.includes("essay") || lowerName.includes("pov") || lowerText.includes("analysis") || lowerText.includes("journal")) {
      guessedCategory = "POV/Commentary";
    }
    setNewCategory(guessedCategory);

    // 3. Process citation guess
    let guessedCitation = `USR-${Date.now().toString().slice(-6)}`;
    // try to match patterns like "348 U.S. 426" or "Rev. Rul. 2023-14" or "26 U.S.C. § 61"
    const citationPattern = /\b\d+\s+U\.S\.\s+\d+|\bRev\.\s+Rul\.\s+\d+-\d+|\b\d+\s+U\.S\.C\.\s+§\s+\d+/i;
    const match = text.match(citationPattern) || fileName.match(citationPattern);
    if (match) {
      guessedCitation = match[0];
    } else {
      // Fallback: search for sections or other common legal patterns
      const secPattern = /\bSec(tion)?\.?\s+\d+/i;
      const secMatch = text.match(secPattern);
      if (secMatch) {
        guessedCitation = secMatch[0];
      }
    }
    setNewCitation(guessedCitation);

    // 4. Process automatic chunking/paging of raw text
    let chunkedText = text;
    if (!text.includes("---PAGE---")) {
      // Split by paragraphs
      const paragraphs = text.split(/\n\s*\n/);
      const pages: string[] = [];
      let currentPage = "";
      
      for (const para of paragraphs) {
        const trimmedPara = para.trim();
        if (!trimmedPara) continue;
        
        if ((currentPage + trimmedPara).length > 1200) {
          if (currentPage) {
            pages.push(currentPage.trim());
            currentPage = trimmedPara;
          } else {
            // If paragraph is extremely long, split by chars
            pages.push(trimmedPara.slice(0, 1200).trim());
            currentPage = trimmedPara.slice(1200);
          }
        } else {
          currentPage += (currentPage ? "\n\n" : "") + trimmedPara;
        }
      }
      if (currentPage) {
        pages.push(currentPage.trim());
      }
      if (pages.length === 0 && text.trim()) {
        pages.push(text.trim());
      }
      chunkedText = pages.join("\n\n---PAGE---\n\n");
    }
    setNewRawPages(chunkedText);

    // 5. Pre-fill default summary if blank
    setNewSummary(`Uploaded document covering ${guessedCitation || titleClean}.`);
    
    // 6. Pre-fill default author
    setNewAuthor("Uploaded User");
    
    // 7. Date
    setNewDate(new Date().toISOString().split("T")[0]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const processFile = async (file: File) => {
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    
    if (isPdf) {
      setNotification({
        message: `Reading PDF "${file.name}"...`,
        type: "success"
      });
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const dataUrl = event.target?.result as string;
          if (!dataUrl) {
            throw new Error("Failed to read PDF file.");
          }
          const base64 = dataUrl.substring(dataUrl.indexOf(",") + 1);
          
          setNotification({
            message: `Extracting text from PDF "${file.name}"...`,
            type: "success"
          });
          
          const response = await fetch("/api/parse-pdf", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ pdfBase64: base64, fileName: file.name })
          });
          
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || "Failed to parse PDF on the server.");
          }
          
          const data = await response.json();
          if (!data.text || !data.text.trim()) {
            throw new Error("No text content could be extracted from this PDF.");
          }
          
          autoDetectAndPopulate(file.name, data.text);
          setNotification({
            message: `Successfully parsed, chunked, and populated PDF "${file.name}". Review the fields and publish!`,
            type: "success"
          });
        } catch (err: any) {
          console.error("PDF import error:", err);
          setNotification({
            message: `PDF Ingestion Failed: ${err.message || err}`,
            type: "error"
          });
        }
      };
      
      reader.onerror = () => {
        setNotification({
          message: "Failed to read file buffer.",
          type: "error"
        });
      };
      
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        autoDetectAndPopulate(file.name, text);
        setNotification({
          message: `Loaded ${file.name}. Content has been auto-chunked into physical sections. Review and publish!`,
          type: "success"
        });
      };
      reader.readAsText(file);
    }
  };

  const processMultipleFiles = async (files: FileList | File[]) => {
    setIsBatchMode(true);
    setIsUploading(true);
    
    const fileArray = Array.from(files);
    const newItems: BatchItem[] = fileArray.map((file, idx) => {
      const id = `batch-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
      batchFilesRef.current[id] = file;
      return {
        id,
        name: file.name,
        size: file.size,
        status: 'queued',
      };
    });

    setBatchQueue(prev => [...prev, ...newItems]);

    // Process them sequentially so that the server isn't overloaded with simultaneous PDF parses & embeddings
    for (const item of newItems) {
      const file = batchFilesRef.current[item.id];
      if (file) {
        await runSingleBatchIngestion(file, item.id);
      }
    }
  };

  const runSingleBatchIngestion = async (file: File, itemId: string) => {
    const updateStatus = (update: Partial<BatchItem>) => {
      setBatchQueue(prev => prev.map(item => item.id === itemId ? { ...item, ...update } : item));
    };

    try {
      updateStatus({ status: 'parsing' });

      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      let fileText = "";
      let pagesArray: string[] = [];

      if (isPdf) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const res = e.target?.result as string;
            if (res) resolve(res);
            else reject(new Error("File empty or could not be read"));
          };
          reader.onerror = () => reject(new Error("Failed to read PDF."));
          reader.readAsDataURL(file);
        });

        const base64 = dataUrl.substring(dataUrl.indexOf(",") + 1);

        const response = await fetch("/api/parse-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64, fileName: file.name })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Server failed to parse PDF.");
        }

        const data = await response.json();
        fileText = data.text || "";
        pagesArray = data.pages || [];
        if (!fileText.trim()) {
          throw new Error("No text content could be extracted from this PDF.");
        }
      } else {
        fileText = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file text."));
          reader.readAsText(file);
        });
      }

      // Autodetect title, category, and citation
      const titleClean = file.name.replace(/\.[^/.]+$/, "");
      const lowerName = file.name.toLowerCase();
      const lowerText = fileText.toLowerCase();

      let guessedCategory: "Act" | "Court Judgment" | "POV/Commentary" | "Tax Document" = "Tax Document";
      if (lowerName.includes("court") || lowerName.includes("judgment") || lowerName.includes(" vs ") || lowerName.includes(" v. ") || lowerText.includes("supreme court") || lowerText.includes("district court")) {
        guessedCategory = "Court Judgment";
      } else if (lowerName.includes("act") || lowerName.includes("statute") || lowerName.includes("irc") || lowerName.includes("section") || lowerText.includes("statutory") || lowerText.includes("congress")) {
        guessedCategory = "Act";
      } else if (lowerName.includes("commentary") || lowerName.includes("essay") || lowerName.includes("pov") || lowerText.includes("analysis") || lowerText.includes("journal")) {
        guessedCategory = "POV/Commentary";
      }

      let guessedCitation = `USR-${Date.now().toString().slice(-6)}`;
      const citationPattern = /\b\d+\s+U\.S\.\s+\d+|\bRev\.\s+Rul\.\s+\d+-\d+|\b\d+\s+U\.S\.C\.\s+§\s+\d+/i;
      const match = fileText.match(citationPattern) || file.name.match(citationPattern);
      if (match) {
        guessedCitation = match[0];
      } else {
        const secPattern = /\bSec(tion)?\.?\s+\d+/i;
        const secMatch = fileText.match(secPattern);
        if (secMatch) {
          guessedCitation = secMatch[0];
        }
      }

      // Build pages
      if (pagesArray.length === 0) {
        if (fileText.includes("---PAGE---")) {
          pagesArray = fileText.split("---PAGE---").map(p => p.trim()).filter(p => p.length > 0);
        } else {
          const paragraphs = fileText.split(/\n\s*\n/);
          const pages: string[] = [];
          let currentPage = "";
          for (const para of paragraphs) {
            const trimmedPara = para.trim();
            if (!trimmedPara) continue;
            if ((currentPage + trimmedPara).length > 1200) {
              if (currentPage) {
                pages.push(currentPage.trim());
                currentPage = trimmedPara;
              } else {
                pages.push(trimmedPara.slice(0, 1200).trim());
                currentPage = trimmedPara.slice(1200);
              }
            } else {
              currentPage += (currentPage ? "\n\n" : "") + trimmedPara;
            }
          }
          if (currentPage) {
            pages.push(currentPage.trim());
          }
          pagesArray = pages;
        }
      }

      if (pagesArray.length === 0 && fileText.trim()) {
        pagesArray.push(fileText.trim());
      }

      updateStatus({
        category: guessedCategory,
        citation: guessedCitation,
        status: 'uploading'
      });

      // Submit/Upload to server
      await onUploadDocument({
        title: titleClean,
        category: guessedCategory,
        citationCode: guessedCitation,
        author: "Batch Upload",
        date: new Date().toISOString().split('T')[0],
        summary: `Batch uploaded document covering ${guessedCitation}.`,
        pages: pagesArray
      });

      updateStatus({ status: 'completed' });
    } catch (err: any) {
      console.error(`Batch item ${file.name} failed:`, err);
      updateStatus({ status: 'failed', error: err.message || "Failed to process" });
    }
  };

  const handleRetryFailed = async () => {
    const failedItems = batchQueue.filter(item => item.status === 'failed');
    if (failedItems.length === 0) return;

    setBatchQueue(prev => prev.map(item => item.status === 'failed' ? { ...item, status: 'queued', error: undefined } : item));

    for (const item of failedItems) {
      const file = batchFilesRef.current[item.id];
      if (file) {
        await runSingleBatchIngestion(file, item.id);
      } else {
        setBatchQueue(prev => prev.map(bi => bi.id === item.id ? { ...bi, status: 'failed', error: "Original file reference lost." } : bi));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      if (files.length > 1 || isBatchMode) {
        processMultipleFiles(files);
      } else {
        processFile(files[0]);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (files.length > 1 || isBatchMode) {
        processMultipleFiles(files);
      } else {
        processFile(files[0]);
      }
    }
  };

  const handleSubmitDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newCategory || !newCitation || !newRawPages) {
      setNotification({ message: "Please fill out all required fields.", type: "error" });
      return;
    }

    const pagesArray = newRawPages.split("---PAGE---").map(p => p.trim()).filter(p => p.length > 0);
    if (pagesArray.length === 0) {
      setNotification({ message: "Document must contain at least one page.", type: "error" });
      return;
    }

    try {
      await onUploadDocument({
        title: newTitle,
        category: newCategory,
        citationCode: newCitation,
        author: newAuthor,
        date: newDate,
        summary: newSummary || `${newCategory} document covering ${newCitation}`,
        pages: pagesArray
      });

      setNotification({ message: "Document successfully ingested and indexed!", type: "success" });
      // Reset
      setNewTitle("");
      setNewCitation("");
      setNewAuthor("");
      setNewDate("");
      setNewSummary("");
      setNewRawPages("");
      setIsUploading(false);
    } catch (err: any) {
      setNotification({ message: `Ingestion failed: ${err.message}`, type: "error" });
    }
  };

  const handleSubmitRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relSource || !relTarget || !relDesc) {
      setNotification({ message: "Please fill out all relationship attributes.", type: "error" });
      return;
    }
    if (relSource === relTarget) {
      setNotification({ message: "Source and Target documents cannot be identical.", type: "error" });
      return;
    }

    try {
      await onAddRelationship({
        sourceId: relSource,
        targetId: relTarget,
        type: relType,
        description: relDesc
      });
      setNotification({ message: "Citation association created successfully!", type: "success" });
      setRelDesc("");
      setIsLinking(false);
    } catch (err: any) {
      setNotification({ message: `Linking failed: ${err.message}`, type: "error" });
    }
  };

  const totalCount = batchQueue.length;
  const completedCount = batchQueue.filter(i => i.status === 'completed').length;
  const failedCount = batchQueue.filter(i => i.status === 'failed').length;
  const processingCount = batchQueue.filter(i => i.status === 'parsing' || i.status === 'uploading').length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      {/* Column 1: Document Sidebar Directory */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-5 flex flex-col h-[650px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-700" />
            Legal Corpus ({documents.length})
          </h3>
          <div className="flex gap-1">
            <button
              onClick={() => { setIsUploading(!isUploading); setIsLinking(false); }}
              className="p-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition flex items-center gap-1 text-xs px-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Ingest
            </button>
            <button
              onClick={() => { setIsLinking(!isLinking); setIsUploading(false); }}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition flex items-center gap-1 text-xs px-2"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Link
            </button>
          </div>
        </div>

        {/* Tab filters */}
        <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100 pb-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md transition ${
                activeTab === cat 
                  ? "bg-slate-100 text-slate-800" 
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* List of documents */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredDocs.map(doc => (
            <div
              key={doc.id}
              onClick={() => handleDocumentSelect(doc.id)}
              className={`p-3 rounded-lg border cursor-pointer transition text-left ${
                selectedDocId === doc.id
                  ? "border-slate-800 bg-slate-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                  doc.category === "Act" ? "bg-amber-100 text-amber-800" :
                  doc.category === "Court Judgment" ? "bg-blue-100 text-blue-800" :
                  doc.category === "Tax Document" ? "bg-green-100 text-green-800" :
                  "bg-purple-100 text-purple-800"
                }`}>
                  {doc.category}
                </span>
                <span className="text-[10px] font-mono font-medium text-gray-500">
                  {doc.citationCode}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-gray-900 mt-1.5 line-clamp-2">
                {doc.title}
              </h4>
              <p className="text-[10px] text-gray-400 mt-1 line-clamp-1 italic">
                {doc.summary}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Column 2 & 3: Display Panel or Action Panel */}
      <div className="xl:col-span-2 h-[650px] flex flex-col bg-white rounded-xl border border-gray-100 shadow-xs overflow-hidden">
        
        {/* Notification alerts */}
        {notification && (
          <div className={`p-3 text-xs flex items-center justify-between border-b ${
            notification.type === "success" 
              ? "bg-emerald-50 text-emerald-800 border-emerald-100" 
              : "bg-rose-50 text-rose-800 border-rose-100"
          }`}>
            <span className="flex items-center gap-1.5">
              {notification.type === "success" ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
              {notification.message}
            </span>
            <button onClick={() => setNotification(null)} className="text-[10px] uppercase font-bold hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {isUploading ? (
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Unified Mode Selection Header */}
            <div className="p-6 pb-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-1">
                  Ingest US Tax Documents
                </h3>
                <p className="text-xs text-gray-500">
                  Import text/PDF files and compile vector embeddings on the server.
                </p>
              </div>
              
              {/* Premium Segmented Mode Selector */}
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-100 select-none">
                <button
                  type="button"
                  onClick={() => setIsBatchMode(false)}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition uppercase tracking-wider flex items-center gap-1 ${
                    !isBatchMode 
                      ? "bg-white text-slate-900 shadow-xs" 
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  Manual Form
                </button>
                <button
                  type="button"
                  onClick={() => setIsBatchMode(true)}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition uppercase tracking-wider flex items-center gap-1 ${
                    isBatchMode 
                      ? "bg-white text-slate-900 shadow-xs" 
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  Batch Multi-PDF
                </button>
              </div>
            </div>

            {isBatchMode ? (
              /* BATCH MULTI-FILE INGESTION CONSOLE */
              <div className="p-6 flex-1 overflow-y-auto space-y-4 min-h-0">
                {/* Drag & Drop File Upload */}
                <label
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  htmlFor="file-upload-batch"
                  className="block border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50/50 transition group"
                >
                  <input
                    type="file"
                    id="file-upload-batch"
                    className="hidden"
                    accept=".txt,.md,.pdf"
                    multiple
                    onChange={handleFileUpload}
                  />
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2 group-hover:text-slate-700 transition" />
                  <p className="text-xs font-semibold text-gray-700">
                    Drag and drop <span className="text-rose-600 font-bold">multiple</span> PDF, TXT or MD files here, or <span className="text-slate-800 underline">browse</span>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Instantly parses multiple PDFs, splits page boundaries, auto-extracts citations, and builds vector embeddings.
                  </p>
                </label>

                {/* Queue Stats Banner */}
                {batchQueue.length > 0 && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">Queue Processing Progress</h4>
                        <p className="text-[10px] text-slate-500">
                          Completed: {completedCount}/{totalCount} ({progressPercent}%) • Failed: {failedCount} • Processing: {processingCount}
                        </p>
                      </div>
                      
                      <div className="flex gap-2">
                        {failedCount > 0 && (
                          <button
                            type="button"
                            onClick={handleRetryFailed}
                            className="px-2.5 py-1 text-[10px] font-bold border border-rose-200 text-rose-700 bg-rose-50 rounded-md hover:bg-rose-100 transition flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry Failed
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setBatchQueue([]);
                            batchFilesRef.current = {};
                          }}
                          className="px-2.5 py-1 text-[10px] font-bold border border-gray-200 text-gray-600 bg-white rounded-md hover:bg-gray-50 transition"
                        >
                          Clear Queue
                        </button>
                      </div>
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-slate-800 h-2 transition-all duration-500 rounded-full" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Batch Items List */}
                {batchQueue.length > 0 ? (
                  <div className="border border-gray-100 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto divide-y divide-gray-100">
                    {batchQueue.map((item) => (
                      <div key={item.id} className="p-3 bg-white hover:bg-gray-50/50 flex items-center justify-between gap-3 transition">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-lg bg-slate-50 text-slate-500 shrink-0">
                            <File className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate">
                              {item.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-gray-400">
                                {Math.round(item.size / 1024)} KB
                              </span>
                              {item.citation && (
                                <span className="text-[9px] text-slate-600 font-mono bg-slate-100 px-1 py-0.2 rounded font-semibold">
                                  {item.citation}
                                </span>
                              )}
                              {item.category && (
                                <span className="text-[9px] text-slate-500 font-medium">
                                  • {item.category}
                                </span>
                              )}
                            </div>
                            {item.error && (
                              <p className="text-[10px] text-rose-600 font-medium mt-0.5">
                                Error: {item.error}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center shrink-0">
                          {item.status === 'queued' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-1 rounded-md">
                              Queued
                            </span>
                          )}
                          {item.status === 'parsing' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-1 rounded-md flex items-center gap-1 animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Parsing PDF
                            </span>
                          )}
                          {item.status === 'uploading' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-800 px-2 py-1 rounded-md flex items-center gap-1 animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Embedding
                            </span>
                          )}
                          {item.status === 'completed' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-1 rounded-md flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-600" />
                              Fully Indexed
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 px-2 py-1 rounded-md flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              Failed
                            </span>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => {
                              setBatchQueue(prev => prev.filter(q => q.id !== item.id));
                              delete batchFilesRef.current[item.id];
                            }}
                            className="ml-2.5 p-1 text-gray-400 hover:text-gray-600 rounded-md transition"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 bg-gray-50/20">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs font-semibold">No documents queued yet</p>
                    <p className="text-[10px] text-gray-400 mt-1">Select files or drag them above to start high-fidelity batch indexing.</p>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-gray-100 shrink-0">
                  <span className="text-[10px] text-gray-400 italic">
                    All document embeddings are compiled dynamically on the server for precise semantic retrieval.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUploading(false);
                      setIsBatchMode(false);
                    }}
                    className="px-4 py-2 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
                  >
                    Close Console
                  </button>
                </div>
              </div>
            ) : (
              /* SINGLE MANUAL DOCUMENT UPLOAD FORM */
              <form onSubmit={handleSubmitDocument} className="p-6 flex-1 overflow-y-auto space-y-4 min-h-0">
                {/* Drag & Drop File Upload */}
                <label
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  htmlFor="file-upload-single"
                  className="block border-2 border-dashed border-gray-200 rounded-lg p-5 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition"
                >
                  <input
                    type="file"
                    id="file-upload-single"
                    className="hidden"
                    accept=".txt,.md,.pdf"
                    onChange={handleFileUpload}
                  />
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-gray-700">
                    Drag and drop a .txt/.md/.pdf document here, or <span className="text-slate-800 underline">browse</span>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Supports structured plain text, markdown, and standard PDF documents.
                  </p>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Commissioner v. Glenshaw Glass Co."
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Category *</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as any)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-slate-800 bg-white"
                    >
                      <option value="Act">Act (Statute)</option>
                      <option value="Court Judgment">Court Judgment</option>
                      <option value="Tax Document">Tax Document (Ruling/IRC)</option>
                      <option value="POV/Commentary">Commentary / Analytical Essay</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Citation Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., 348 U.S. 426"
                      value={newCitation}
                      onChange={(e) => setNewCitation(e.target.value)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Author</label>
                    <input
                      type="text"
                      placeholder="e.g., Justice Warren"
                      value={newAuthor}
                      onChange={(e) => setNewAuthor(e.target.value)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Date</label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Brief Summary</label>
                  <textarea
                    placeholder="Write a highly concise summary of this tax document..."
                    rows={2}
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Document Content (Raw Pages) *</label>
                  <p className="text-[10px] text-gray-400 mb-1">
                    Insert <code className="font-mono bg-gray-50 text-rose-500 px-1 py-0.5 rounded">---PAGE---</code> at each physical boundary to preserve page numbers.
                  </p>
                  <textarea
                    required
                    placeholder="[Page 1 Content]&#10;---PAGE---&#10;[Page 2 Content]"
                    rows={7}
                    value={newRawPages}
                    onChange={(e) => setNewRawPages(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-slate-800 font-mono"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsUploading(false)}
                    className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
                  >
                    Publish and Embed
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : isLinking ? (
          /* ADD RELATIONSHIP FORM (Graph RAG) */
          <form onSubmit={handleSubmitRelationship} className="p-6 flex-1 overflow-y-auto space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-1">
                Create Relational Legal Link
              </h3>
              <p className="text-xs text-gray-500">
                Link precedent case law, commentaries, or revenue rulings to statutory codes.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Source Document (Active)</label>
                <select
                  required
                  value={relSource}
                  onChange={(e) => setRelSource(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-200 rounded-lg bg-white"
                >
                  <option value="">-- Select Source Document --</option>
                  {documents.map(d => (
                    <option key={d.id} value={d.id}>[{d.citationCode}] {d.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Target Document (Linked)</label>
                <select
                  required
                  value={relTarget}
                  onChange={(e) => setRelTarget(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-200 rounded-lg bg-white"
                >
                  <option value="">-- Select Target Document --</option>
                  {documents.map(d => (
                    <option key={d.id} value={d.id}>[{d.citationCode}] {d.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Association Type</label>
              <select
                value={relType}
                onChange={(e) => setRelType(e.target.value as any)}
                className="w-full text-xs p-2.5 border border-gray-200 rounded-lg bg-white"
              >
                <option value="cites">Cites (Case law mentions another source)</option>
                <option value="interprets">Interprets (Judgement clarifies a Statute)</option>
                <option value="supersedes">Supersedes (New law replaces former law)</option>
                <option value="discusses">Discusses (Commentary analyzes a case or act)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Relationship Description *</label>
              <textarea
                required
                placeholder="Describe the legal overlap. e.g., 'Glenshaw Glass interprets Gross Income in Section 61 broadly as accessions to wealth...'"
                rows={4}
                value={relDesc}
                onChange={(e) => setRelDesc(e.target.value)}
                className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-slate-800"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsLinking(false)}
                className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
              >
                Map Citation
              </button>
            </div>
          </form>
        ) : selectedDoc ? (
          /* ACTIVE DOCUMENT DISPLAY READER */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 bg-gray-50">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-mono font-bold text-gray-500 bg-white border px-1.5 py-0.5 rounded">
                      {selectedDoc.citationCode}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-[10px] uppercase font-bold text-slate-800">
                      {selectedDoc.category}
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-gray-900">
                    {selectedDoc.title}
                  </h2>
                </div>
                <div className="text-right text-[10px] text-gray-400 space-y-0.5 whitespace-nowrap shrink-0">
                  <p className="flex items-center justify-end gap-1"><User className="w-3.5 h-3.5" /> {selectedDoc.author}</p>
                  <p className="flex items-center justify-end gap-1"><Calendar className="w-3.5 h-3.5" /> {selectedDoc.date}</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 bg-white p-2.5 rounded-lg border border-gray-100 mt-3 italic leading-relaxed">
                <strong>Summary: </strong> {selectedDoc.summary}
              </p>
            </div>

            {/* Document Content - Page Aware */}
            <div className="flex-1 overflow-y-auto p-5 font-serif text-sm leading-relaxed text-gray-800 bg-white">
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono uppercase pb-2 border-b border-dashed border-gray-100">
                  <span>Page {currentPage} of {selectedDoc.pages.length}</span>
                  <span>PREVIEW CAPTION INDEX</span>
                </div>
                
                <p className="whitespace-pre-wrap leading-relaxed tracking-wide text-gray-900 pt-2">
                  {selectedDoc.pages[currentPage - 1]}
                </p>
              </div>
            </div>

            {/* Citations Network (Graph relationships) */}
            {(relatedFrom.length > 0 || relatedTo.length > 0) && (
              <div className="bg-slate-50 border-t border-gray-100 p-4">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" />
                  Citation Relationships Graph
                </h4>
                <div className="flex flex-wrap gap-2">
                  {relatedFrom.map((rel, idx) => {
                    const target = documents.find(d => d.id === rel.targetId);
                    return target ? (
                      <div
                        key={`from-${idx}`}
                        onClick={() => handleDocumentSelect(target.id)}
                        className="bg-white border hover:border-slate-800 rounded px-2.5 py-1.5 text-[10px] leading-tight text-gray-700 cursor-pointer transition shadow-2xs flex flex-col gap-0.5"
                      >
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          {rel.type.toUpperCase()} → {target.citationCode}
                        </span>
                        <span className="text-gray-400 italic line-clamp-1 max-w-xs">{rel.description}</span>
                      </div>
                    ) : null;
                  })}
                  
                  {relatedTo.map((rel, idx) => {
                    const source = documents.find(d => d.id === rel.sourceId);
                    return source ? (
                      <div
                        key={`to-${idx}`}
                        onClick={() => handleDocumentSelect(source.id)}
                        className="bg-white border hover:border-slate-800 rounded px-2.5 py-1.5 text-[10px] leading-tight text-gray-700 cursor-pointer transition shadow-2xs flex flex-col gap-0.5"
                      >
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          ← CITED BY {source.citationCode} ({rel.type.toUpperCase()})
                        </span>
                        <span className="text-gray-400 italic line-clamp-1 max-w-xs">{rel.description}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {/* Page Pagination Controls */}
            <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
              <span className="text-xs text-gray-500">
                Total Pages: <strong>{selectedDoc.pages.length}</strong>
              </span>
              <div className="flex gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="p-1 border rounded-md hover:bg-white transition disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-xs font-mono py-1 px-3 bg-white border rounded">
                  Page {currentPage} / {selectedDoc.pages.length}
                </span>
                <button
                  disabled={currentPage === selectedDoc.pages.length}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, selectedDoc.pages.length))}
                  className="p-1 border rounded-md hover:bg-white transition disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* EMPTY CORPUS READER VIEW */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
            <BookOpen className="w-12 h-12 mb-3 text-gray-300" />
            <h4 className="text-xs font-semibold text-gray-700">No Document Selected</h4>
            <p className="text-[11px] text-gray-500 max-w-xs mt-1">
              Select a statute, legal ruling, or court judgment from the sidebar to inspect its multi-page source, summaries, and structural relationships.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
