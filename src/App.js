import { useEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import axios from "axios"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Upload, 
  Type, 
  Image as ImageIcon, 
  Calendar, 
  Circle,
  Signature,
  Monitor,
  Smartphone,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  FileText,
  X,
  Maximize2,
  Move,
  GripVertical
} from "lucide-react"
import "./App.css"

pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;



const BACKEND_BASE_URL = "https://signature-injection-engine-backend-iosb.onrender.com"

const FIELD_TYPES = [
  { type: "text", label: "Text Box", icon: Type, color: "#3B82F6" },
  { type: "signature", label: "Signature", icon: Signature, color: "#10B981" },
  { type: "image", label: "Image Box", icon: ImageIcon, color: "#8B5CF6" },
  { type: "date", label: "Date", icon: Calendar, czolor: "#F59E0B" },
  { type: "radio", label: "Radio", icon: Circle, color: "#EC4899" }
]

function App() {
  const [pdfMeta, setPdfMeta] = useState({ pdfId: null, url: null })
  const [fields, setFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [pagePixelSize, setPagePixelSize] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)
  const [viewMode, setViewMode] = useState("desktop")
  const [signatureFile, setSignatureFile] = useState(null)
  const [isSigning, setIsSigning] = useState(false)
  const [isLoadingPdf, setIsLoadingPdf] = useState(false)
  const [numPages, setNumPages] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [dragState, setDragState] = useState(null)
  const [resizeState, setResizeState] = useState(null)
  const [showFieldPreview, setShowFieldPreview] = useState(false)
  const [previewField, setPreviewField] = useState(null)

  const pageContainerRef = useRef(null)

  const handleDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    setIsLoadingPdf(false)
  }

  const handlePageRenderSuccess = () => {
    if (pageContainerRef.current) {
      const rect = pageContainerRef.current.getBoundingClientRect()
      setPagePixelSize({ width: rect.width - 24, height: rect.height - 24 })
    }
  }

  const computeNormalizedFromPixels = (left, top, width, height) => {
    if (!pagePixelSize.width || !pagePixelSize.height) return null
    const xRel = left / pagePixelSize.width
    const yRel = top / pagePixelSize.height
    const wRel = width / pagePixelSize.width
    const hRel = height / pagePixelSize.height
    return { xRel, yRel, wRel, hRel }
  }

  const computePixelsFromNormalized = coordinate => {
    if (!pagePixelSize.width || !pagePixelSize.height) return null
    const left = coordinate.xRel * pagePixelSize.width
    const top = coordinate.yRel * pagePixelSize.height
    const width = coordinate.wRel * pagePixelSize.width
    const height = coordinate.hRel * pagePixelSize.height
    return { left, top, width, height }
  }

  const handlePaletteDragStart = (e, type) => {
    e.dataTransfer.effectAllowed = "copy"
    e.dataTransfer.setData("application/x-field-type", type)
    
    const fieldType = FIELD_TYPES.find(f => f.type === type)
    setPreviewField(fieldType)
    setShowFieldPreview(true)
  }

  const handlePaletteDragEnd = () => {
    setShowFieldPreview(false)
    setPreviewField(null)
  }

  const handleOverlayDragOver = e => {
    e.preventDefault()
  }

  const handleDropField = (e, fieldType) => {
    if (!pagePixelSize.width || !pagePixelSize.height) return
    const overlayRect = pageContainerRef.current.getBoundingClientRect()
    const leftPx = e.clientX - overlayRect.left - 12
    const topPx = e.clientY - overlayRect.top - 12
    const defaultWidth = pagePixelSize.width * 0.2
    const defaultHeight = 40
    const normalized = computeNormalizedFromPixels(
      leftPx - defaultWidth / 2,
      topPx - defaultHeight / 2,
      defaultWidth,
      defaultHeight
    )
    if (!normalized) return
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    const newField = {
      id,
      type: fieldType,
      pageIndex: currentPage - 1,
      coordinate: normalized,
      value: "",
      checked: false
    }
    setFields(prev => [...prev, newField])
    setSelectedFieldId(id)
    
    setTimeout(() => {
      const successElement = document.getElementById(`field-${id}`)
      if (successElement) {
        successElement.classList.add('field-created')
        setTimeout(() => {
          successElement.classList.remove('field-created')
        }, 1000)
      }
    }, 100)
  }

  const handleOverlayDrop = e => {
    e.preventDefault()
    const type = e.dataTransfer.getData("application/x-field-type")
    if (!type) return
    handleDropField(e, type)
    setShowFieldPreview(false)
    setPreviewField(null)
  }

  const handleFieldMouseDown = (e, fieldId) => {
    e.stopPropagation()
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    const px = computePixelsFromNormalized(field.coordinate)
    if (!px) return
    const startX = e.clientX
    const startY = e.clientY
    setDragState({
      fieldId,
      startX,
      startY,
      initialLeft: px.left,
      initialTop: px.top
    })
    setSelectedFieldId(fieldId)
  }

  const handleResizeMouseDown = (e, fieldId) => {
    e.stopPropagation()
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    const px = computePixelsFromNormalized(field.coordinate)
    if (!px) return
    setResizeState({
      fieldId,
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: px.width,
      initialHeight: px.height,
      initialLeft: px.left,
      initialTop: px.top
    })
  }

  const handleMouseMove = e => {
    if (!pagePixelSize.width || !pagePixelSize.height) return

    if (dragState) {
      const dx = e.clientX - dragState.startX
      const dy = e.clientY - dragState.startY
      const newLeft = dragState.initialLeft + dx
      const newTop = dragState.initialTop + dy
      const width = computePixelsFromNormalized(
        fields.find(f => f.id === dragState.fieldId).coordinate
      ).width
      const height = computePixelsFromNormalized(
        fields.find(f => f.id === dragState.fieldId).coordinate
      ).height

      const normalized = computeNormalizedFromPixels(newLeft, newTop, width, height)
      if (!normalized) return
      setFields(prev =>
        prev.map(f =>
          f.id === dragState.fieldId ? { ...f, coordinate: normalized } : f
        )
      )
    }

    if (resizeState) {
      const dx = e.clientX - resizeState.startX
      const dy = e.clientY - resizeState.startY
      const newWidth = Math.max(30, resizeState.initialWidth + dx)
      const newHeight = Math.max(20, resizeState.initialHeight + dy)
      const normalized = computeNormalizedFromPixels(
        resizeState.initialLeft,
        resizeState.initialTop,
        newWidth,
        newHeight
      )
      if (!normalized) return
      setFields(prev =>
        prev.map(f =>
          f.id === resizeState.fieldId ? { ...f, coordinate: normalized } : f
        )
      )
    }
  }

  const handleMouseUp = () => {
    if (dragState) setDragState(null)
    if (resizeState) setResizeState(null)
  }

  const handleSignatureFileChange = e => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setSignatureFile(file)
  }

  const fileToBase64 = file => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = error => reject(error)
      reader.readAsDataURL(file)
    })
  }

  const handlePdfFileChange = async e => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append("pdf", file)
    try {
      setIsLoadingPdf(true)
      const res = await axios.post(`${BACKEND_BASE_URL}/api/upload-pdf`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      const { pdfId, pdfUrl } = res.data
      setPdfMeta({
        pdfId,
        url: `${BACKEND_BASE_URL}${pdfUrl}`
      })
      setFields([])
      setCurrentPage(1)
    } catch (err) {
      console.error(err)
      alert("Failed to upload PDF")
      setIsLoadingPdf(false)
    }
  }

  const updateFieldValue = (id, value) => {
    setFields(prev =>
      prev.map(f => (f.id === id ? { ...f, value } : f))
    )
  }

  const updateFieldChecked = (id, checked) => {
    setFields(prev =>
      prev.map(f => (f.id === id ? { ...f, checked } : f))
    )
  }

  const handleSignDocument = async () => {
    try {
      if (!pdfMeta.pdfId) {
        alert("Upload a PDF first")
        return
      }
      if (!signatureFile) {
        alert("Upload a signature image first")
        return
      }
      const hasSignatureField = fields.some(f => f.type === "signature")
      if (!hasSignatureField) {
        alert("Place at least one signature field on the PDF")
        return
      }
      setIsSigning(true)
      const base64 = await fileToBase64(signatureFile)

      const payloadFields = fields.map(f => ({
        type: f.type,
        pageIndex: f.pageIndex,
        xRel: f.coordinate.xRel,
        yRel: f.coordinate.yRel,
        wRel: f.coordinate.wRel,
        hRel: f.coordinate.hRel,
        value: f.value || "",
        checked: !!f.checked
      }))

      const res = await axios.post(`${BACKEND_BASE_URL}/api/sign-pdf`, {
        pdfId: pdfMeta.pdfId,
        signatureImageBase64: base64,
        fields: payloadFields
      })

      const url = `${BACKEND_BASE_URL}${res.data.signedPdfUrl}`
      window.open(url, "_blank")
    } catch (err) {
      console.error(err)
      alert("Failed to sign PDF")
    } finally {
      setIsSigning(false)
    }
  }

  const deleteField = (id) => {
    setFields(prev => prev.filter(f => f.id !== id))
    if (selectedFieldId === id) {
      setSelectedFieldId(null)
    }
  }

  useEffect(() => {
    const handleResize = () => {
      if (pageContainerRef.current) {
        const rect = pageContainerRef.current.getBoundingClientRect()
        setPagePixelSize({ width: rect.width - 24, height: rect.height - 24 })
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const viewerWidthStyle =
    viewMode === "mobile"
      ? { maxWidth: "420px", width: "100%" }
      : { maxWidth: "900px", width: "100%" }

  const fieldsForCurrentPage = fields.filter(f => f.pageIndex === currentPage - 1)
  const selectedField = fields.find(f => f.id === selectedFieldId) || null

  return (
    <motion.div 
      className="app-root"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      
      <motion.header 
        className="header"
        initial={{ y: -50 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="header-left">
          <div className="logo">
            <Signature className="logo-icon" />
            <div className="logo-text">
              <span className="logo-title">Signature Injection Engine</span>
              <span className="logo-subtitle">Secure • Dynamic • Professional</span>
            </div>
          </div>
        </div>
        <motion.div 
          className="header-badge"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <CheckCircle size={14} />
          <span>MERN Stack</span>
        </motion.div>
      </motion.header>

      
      <div className="layout">
        
        <motion.aside 
          className="sidebar"
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          
          <motion.div className="sidebar-section" whileHover={{ scale: 1.02 }}>
            <div className="sidebar-section-header">
              <FileText size={16} />
              <h3>PDF Document</h3>
            </div>
            <div className="upload-area">
              <label className="upload-label">
                <Upload size={20} />
                <span>Upload PDF</span>
                <input 
                  type="file" 
                  accept="application/pdf" 
                  onChange={handlePdfFileChange}
                  className="upload-input"
                />
              </label>
              {pdfMeta.pdfId && (
                <motion.div 
                  className="upload-info"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="upload-info-content">
                    <span className="upload-status">Loaded</span>
                    <span className="upload-id">{pdfMeta.pdfId.slice(0, 8)}...</span>
                  </div>
                  <div className="upload-indicator active"></div>
                </motion.div>
              )}
            </div>
          </motion.div>

        
          <motion.div className="sidebar-section" whileHover={{ scale: 1.02 }}>
            <div className="sidebar-section-header">
              <Type size={16} />
              <h3>Field Types</h3>
            </div>
            <div className="field-palette">
              {FIELD_TYPES.map((item) => {
                const Icon = item.icon
                return (
                  <motion.div
                    key={item.type}
                    className="palette-item"
                    draggable
                    onDragStart={e => handlePaletteDragStart(e, item.type)}
                    onDragEnd={handlePaletteDragEnd}
                    whileHover={{ scale: 1.05, x: 5 }}
                    whileTap={{ scale: 0.95 }}
                    style={{ borderColor: item.color + '40' }}
                  >
                    <div className="palette-item-icon" style={{ color: item.color }}>
                      <Icon size={14} />
                    </div>
                    <span>{item.label}</span>
                    <GripVertical size={14} className="palette-drag-handle" />
                  </motion.div>
                )
              })}
            </div>
          </motion.div>

         
          <motion.div className="sidebar-section" whileHover={{ scale: 1.02 }}>
            <div className="sidebar-section-header">
              <Signature size={16} />
              <h3>Signature</h3>
            </div>
            <div className="signature-upload">
              <label className="signature-label">
                <div className="signature-icon">
                  <Signature size={24} />
                </div>
                <div className="signature-content">
                  <span className="signature-title">Upload Signature</span>
                  <span className="signature-subtitle">PNG or JPG</span>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleSignatureFileChange}
                  className="signature-input"
                />
              </label>
              {signatureFile && (
                <motion.div 
                  className="signature-preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <span>{signatureFile.name}</span>
                  <div className="signature-indicator"></div>
                </motion.div>
              )}
            </div>
          </motion.div>

          <motion.div className="sidebar-section" whileHover={{ scale: 1.02 }}>
            <div className="sidebar-section-header">
              <Move size={16} />
              <h3>Field Editor</h3>
            </div>
            <div className="field-editor">
              <AnimatePresence>
                {selectedField ? (
                  <motion.div 
                    className="field-editor-content"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="field-header">
                      <div className="field-type-badge" style={{ 
                        background: FIELD_TYPES.find(f => f.type === selectedField.type)?.color + '20',
                        color: FIELD_TYPES.find(f => f.type === selectedField.type)?.color
                      }}>
                        {FIELD_TYPES.find(f => f.type === selectedField.type)?.label}
                      </div>
                      <button 
                        className="delete-field-btn"
                        onClick={() => deleteField(selectedField.id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    
                    <div className="field-properties">
                      <div className="property">
                        <span className="property-label">Page</span>
                        <span className="property-value">{selectedField.pageIndex + 1}</span>
                      </div>
                      
                      {(selectedField.type === "text" || selectedField.type === "date") && (
                        <div className="property">
                          <span className="property-label">Value</span>
                          <input
                            type="text"
                            value={selectedField.value || ""}
                            onChange={e => updateFieldValue(selectedField.id, e.target.value)}
                            className="property-input"
                            placeholder="Enter value..."
                          />
                        </div>
                      )}
                      
                      {selectedField.type === "radio" && (
                        <div className="property checkbox-property">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={!!selectedField.checked}
                              onChange={e => updateFieldChecked(selectedField.id, e.target.checked)}
                              className="checkbox-input"
                            />
                            <span className="checkbox-custom"></span>
                            <span>Checked</span>
                          </label>
                        </div>
                      )}
                      
                      {selectedField.type === "image" && (
                        <div className="property info-property">
                          <div className="info-icon">i</div>
                          <span>Image box reserved for signature injection</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    className="field-editor-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Move size={24} className="empty-icon" />
                    <p>Select a field to edit properties</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.aside>

        
        <main className="viewer-container">
          
          <motion.div 
            className="viewer-toolbar"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="toolbar-section">
              <div className="view-mode-buttons">
                <button
                  onClick={() => setViewMode("desktop")}
                  className={`view-mode-btn ${viewMode === "desktop" ? "active" : ""}`}
                >
                  <Monitor size={16} />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={() => setViewMode("mobile")}
                  className={`view-mode-btn ${viewMode === "mobile" ? "active" : ""}`}
                >
                  <Smartphone size={16} />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            <div className="toolbar-section">
              <div className="zoom-controls">
                <button 
                  onClick={() => setScale(prev => Math.max(0.5, prev - 0.1))}
                  className="zoom-btn"
                >
                  <ZoomOut size={16} />
                </button>
                <div className="zoom-display">
                  <span>{Math.round(scale * 100)}%</span>
                </div>
                <button 
                  onClick={() => setScale(prev => Math.min(2, prev + 0.1))}
                  className="zoom-btn"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            </div>

            <div className="toolbar-section">
              <div className="page-controls">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={!numPages || currentPage <= 1}
                  className="page-btn"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="page-info">
                  <span className="page-current">{currentPage}</span>
                  <span className="page-separator">/</span>
                  <span className="page-total">{numPages || 0}</span>
                </div>
                <button
                  onClick={() => setCurrentPage(p => (numPages ? Math.min(numPages, p + 1) : p))}
                  disabled={!numPages || currentPage >= numPages}
                  className="page-btn"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="toolbar-section">
              <motion.button
                className="sign-button"
                onClick={handleSignDocument}
                disabled={isSigning || isLoadingPdf || !pdfMeta.url}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isSigning ? (
                  <>
                    <div className="spinner"></div>
                    <span>Signing...</span>
                  </>
                ) : (
                  <>
                    <Signature size={16} />
                    <span>Sign & Generate PDF</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>

          
          <div className="pdf-viewer">
            <motion.div
              className="pdf-container"
              style={viewerWidthStyle}
              ref={pageContainerRef}
              onDragOver={handleOverlayDragOver}
              onDrop={handleOverlayDrop}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {pdfMeta.url ? (
                <div className="pdf-document">
                  <Document
                    file={pdfMeta.url}
                    onLoadSuccess={handleDocumentLoadSuccess}
                    loading={
                      <div className="pdf-loading">
                        <div className="loading-spinner"></div>
                        <span>Loading PDF...</span>
                      </div>
                    }
                    onLoadError={err => {
                      console.error(err)
                      alert("Failed to load PDF")
                    }}
                  >
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      onRenderSuccess={handlePageRenderSuccess}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </Document>
                  
                  
                  <div className="field-layer">
                    {fieldsForCurrentPage.map(field => {
                      const px = computePixelsFromNormalized(field.coordinate)
                      if (!px) return null
                      const isSelected = field.id === selectedFieldId
                      const fieldType = FIELD_TYPES.find(f => f.type === field.type)
                      
                      return (
                        <motion.div
                          key={field.id}
                          id={`field-${field.id}`}
                          className={`field-box ${isSelected ? "selected" : ""}`}
                          style={{
                            left: px.left,
                            top: px.top,
                            width: px.width,
                            height: px.height,
                            borderColor: fieldType?.color
                          }}
                          onMouseDown={e => handleFieldMouseDown(e, field.id)}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 300 }}
                          whileHover={{ scale: 1.02 }}
                        >
                          <div className="field-content">
                            <div className="field-icon" style={{ color: fieldType?.color }}>
                              {fieldType?.icon && <fieldType.icon size={12} />}
                            </div>
                            <span className="field-label">
                              {field.type === "radio"
                                ? field.checked ? "✓ Radio" : "○ Radio"
                                : field.type}
                            </span>
                          </div>
                          <div
                            className="resize-handle"
                            onMouseDown={e => handleResizeMouseDown(e, field.id)}
                          >
                            <Maximize2 size={8} />
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <motion.div 
                  className="pdf-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="empty-illustration">
                    <Upload size={48} />
                  </div>
                  <h3>Upload a PDF to Begin</h3>
                  <p>Drag & drop or click to upload your document</p>
                </motion.div>
              )}
            </motion.div>
          </div>
        </main>
      </div>

      
      <motion.footer 
        className="footer"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="footer-left">
          <span className="footer-info">
            <span className="info-label">Browser Origin:</span> Top-Left
          </span>
          <span className="footer-info">
            <span className="info-label">PDF Origin:</span> Bottom-Left
          </span>
        </div>
        <div className="footer-right">
          <span className="security-badge">
            🔒 SHA-256 • MongoDB Audit Trail • Secure Processing
          </span>
        </div>
      </motion.footer>

      
      <AnimatePresence>
        {showFieldPreview && previewField && (
          <motion.div
            className="field-preview-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="field-preview" style={{ color: previewField.color }}>
              <previewField.icon size={24} />
              <span>{previewField.label}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default App