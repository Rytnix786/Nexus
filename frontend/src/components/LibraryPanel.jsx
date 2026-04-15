import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileText, Database, Folders, UploadCloud, Trash2 } from 'lucide-react';
import { uploadSources } from '../lib/api';

export default function LibraryPanel() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.docx,.txt,.json,.md';
    
    input.onchange = async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      
      setUploading(true);
      setUploadError(null);
      try {
        const result = await uploadSources(files);
        setUploadedFiles(result.files || []);
        setTotalBytes(result.combined_chars || 0);
      } catch (err) {
        setUploadError(String(err.message || 'Upload failed'));
        console.error('Upload failed:', err);
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }, []);

  const handleDeleteFile = useCallback((filename) => {
    setUploadedFiles(prev => prev.filter(f => f.filename !== filename));
  }, []);
  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar relative z-10 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
         <div>
           <h1 className="text-3xl font-headline font-bold text-on-surface">Knowledge Library</h1>
           <p className="text-on-surface-variant font-label text-sm mt-1">Upload documents to provide context for Nexus agents in the current session.</p>
         </div>
         <button 
           onClick={handleUploadClick}
           disabled={uploading}
           className="bg-primary text-[#005762] font-bold px-6 py-2 rounded-full transition-all hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] flex items-center gap-2 text-sm hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
         >
           <UploadCloud className="w-4 h-4" />
           {uploading ? 'Uploading...' : 'Upload Source'}
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
         <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/20 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex justify-center items-center">
               <FileText className="w-6 h-6" />
            </div>
            <div>
               <div className="text-2xl font-bold font-headline text-on-surface">{uploadedFiles.length}</div>
               <div className="text-xs uppercase tracking-widest text-on-surface-variant">Files Uploaded</div>
            </div>
         </div>
         <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/20 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary/10 text-secondary flex justify-center items-center">
               <Database className="w-6 h-6" />
            </div>
            <div>
               <div className="text-2xl font-bold font-headline text-on-surface">{(totalBytes / 1024).toFixed(1)} KB</div>
               <div className="text-xs uppercase tracking-widest text-on-surface-variant">Total Size</div>
            </div>
         </div>
         <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/20 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex justify-center items-center">
               <Folders className="w-6 h-6" />
            </div>
            <div>
               <div className="text-2xl font-bold font-headline text-on-surface">Session</div>
               <div className="text-xs uppercase tracking-widest text-on-surface-variant">Scope</div>
            </div>
         </div>
      </div>

      {uploadError && (
        <div className="glass-panel border border-error/30 rounded-2xl p-4 mb-6 text-error text-sm">
          Error: {uploadError}
        </div>
      )}

      {uploadedFiles.length === 0 ? (
        <div className="glass-panel border border-outline-variant/20 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <UploadCloud className="w-8 h-8" />
          </div>
          <p className="text-on-surface font-medium mb-2">No files uploaded yet</p>
          <p className="text-on-surface-variant text-sm mb-6">Upload documents to provide context for Nexus agents in this session.</p>
          <button 
            onClick={handleUploadClick}
            disabled={uploading}
            className="bg-primary/20 text-primary border border-primary/40 font-bold px-6 py-2 rounded-full text-sm hover:bg-primary/30 transition-colors disabled:opacity-50"
          >
            Choose Files
          </button>
        </div>
      ) : (
        <div className="glass-panel border border-outline-variant/20 rounded-[2rem] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                <th className="p-5 text-xs uppercase tracking-widest font-label text-on-surface-variant font-medium">File Name</th>
                <th className="p-5 text-xs uppercase tracking-widest font-label text-on-surface-variant font-medium">Size</th>
                <th className="p-5 text-xs uppercase tracking-widest font-label text-on-surface-variant font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {uploadedFiles.map((file, i) => (
                <motion.tr 
                  key={i} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-b border-outline-variant/10 hover:bg-surface-container-highest/30 transition-colors"
                >
                  <td className="p-5 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-sm text-on-surface">{file.filename}</span>
                  </td>
                  <td className="p-5 text-sm text-on-surface-variant">{((file.size_bytes || 0) / 1024).toFixed(1)} KB</td>
                  <td className="p-5 text-sm">
                    <button 
                      onClick={() => handleDeleteFile(file.filename)}
                      className="text-on-surface-variant hover:text-error transition-colors flex items-center gap-1 text-xs"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
