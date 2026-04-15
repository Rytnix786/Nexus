import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Database, Folders, UploadCloud } from 'lucide-react';
import clsx from 'clsx';

const mockSources = [
  { id: '1', name: 'Q4_Financial_Report.pdf', size: '2.4 MB', type: 'PDF Document', uploaded: '2 hrs ago' },
  { id: '2', name: 'API_Documentation_v2.md', size: '150 KB', type: 'Markdown', uploaded: '1 day ago' },
  { id: '3', name: 'Customer_Interviews_Q3.docx', size: '1.1 MB', type: 'Word Document', uploaded: '3 days ago' },
  { id: '4', name: 'system_architecture.json', size: '45 KB', type: 'JSON Config', uploaded: '1 week ago' },
];

export default function LibraryPanel() {
  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar relative z-10 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
         <div>
           <h1 className="text-3xl font-headline font-bold text-on-surface">Knowledge Library</h1>
           <p className="text-on-surface-variant font-label text-sm mt-1">Manage documents and static context available to Nexus agents.</p>
         </div>
         <button className="bg-primary text-[#005762] font-bold px-6 py-2 rounded-full transition-all hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] flex items-center gap-2 text-sm hover:-translate-y-0.5">
           <UploadCloud className="w-4 h-4" />
           Upload Source
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
         <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/20 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex justify-center items-center">
               <Folders className="w-6 h-6" />
            </div>
            <div>
               <div className="text-2xl font-bold font-headline text-on-surface">24</div>
               <div className="text-xs uppercase tracking-widest text-on-surface-variant">Total Collections</div>
            </div>
         </div>
         <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/20 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary/10 text-secondary flex justify-center items-center">
               <FileText className="w-6 h-6" />
            </div>
            <div>
               <div className="text-2xl font-bold font-headline text-on-surface">142</div>
               <div className="text-xs uppercase tracking-widest text-on-surface-variant">Documents</div>
            </div>
         </div>
         <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/20 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex justify-center items-center">
               <Database className="w-6 h-6" />
            </div>
            <div>
               <div className="text-2xl font-bold font-headline text-on-surface">1.2 GB</div>
               <div className="text-xs uppercase tracking-widest text-on-surface-variant">Storage Used</div>
            </div>
         </div>
      </div>

      <div className="glass-panel border border-outline-variant/20 rounded-[2rem] overflow-hidden">
         <table className="w-full text-left border-collapse">
            <thead>
               <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                  <th className="p-5 text-xs uppercase tracking-widest font-label text-on-surface-variant font-medium">Source Name</th>
                  <th className="p-5 text-xs uppercase tracking-widest font-label text-on-surface-variant font-medium">Type</th>
                  <th className="p-5 text-xs uppercase tracking-widest font-label text-on-surface-variant font-medium">Size</th>
                  <th className="p-5 text-xs uppercase tracking-widest font-label text-on-surface-variant font-medium">Uploaded</th>
               </tr>
            </thead>
            <tbody>
               {mockSources.map((source, i) => (
                  <motion.tr 
                    key={source.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-outline-variant/10 hover:bg-surface-container-highest/30 transition-colors"
                  >
                     <td className="p-5 flex items-center gap-3">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="font-medium text-sm text-on-surface">{source.name}</span>
                     </td>
                     <td className="p-5 text-sm text-on-surface-variant">{source.type}</td>
                     <td className="p-5 text-sm text-on-surface-variant">{source.size}</td>
                     <td className="p-5 text-sm text-on-surface-variant">{source.uploaded}</td>
                  </motion.tr>
               ))}
            </tbody>
         </table>
      </div>
    </div>
  );
}
