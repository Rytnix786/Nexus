import React from 'react';
import { Settings, Bell, KeyRound } from 'lucide-react';

export default function Navbar({ currentTab = 'dashboard', onTabChange, onStartRun, authState = null, activeRunId = '', authTokenDraft = '', onAuthTokenDraftChange, onApplyAuthToken }) {
  return (
    <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-20 bg-[#0c0e13]/80 backdrop-blur-xl border-b border-[#46484e]/15">
      <div className="flex items-center gap-12">
        <span className="text-2xl font-bold text-primary drop-shadow-[0_0_10px_rgba(0,229,255,0.4)] font-headline tracking-tight">Nexus AI</span>
        <div className="hidden md:flex gap-8 items-center">
          <button onClick={() => onTabChange('dashboard')} className={`font-headline transition-all duration-300 ${['dashboard', 'active', 'history'].includes(currentTab) ? 'text-primary border-b-2 border-primary pb-1' : 'text-[#f3f3fb]/40 hover:text-primary'}`}>Orchestrator</button>
          <button onClick={() => onTabChange('agents')} className={`font-headline transition-all duration-300 ${currentTab === 'agents' ? 'text-primary border-b-2 border-primary pb-1' : 'text-[#f3f3fb]/40 hover:text-primary'}`}>Agents</button>
          <button onClick={() => onTabChange('models')} className={`font-headline transition-all duration-300 ${currentTab === 'models' ? 'text-primary border-b-2 border-primary pb-1' : 'text-[#f3f3fb]/40 hover:text-primary'}`}>Models</button>
          <button onClick={() => onTabChange('library')} className={`font-headline transition-all duration-300 ${currentTab === 'library' ? 'text-primary border-b-2 border-primary pb-1' : 'text-[#f3f3fb]/40 hover:text-primary'}`}>Library</button>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden xl:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
          <KeyRound className="w-4 h-4 text-on-surface-variant" />
          <input
            value={authTokenDraft}
            onChange={(event) => typeof onAuthTokenDraftChange === 'function' && onAuthTokenDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (typeof onApplyAuthToken === 'function') onApplyAuthToken();
              }
            }}
            placeholder="API key / JWT"
            className="w-72 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
          />
          <button
            type="button"
            onClick={() => typeof onApplyAuthToken === 'function' && onApplyAuthToken()}
            className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-[#005762] hover:brightness-110"
          >
            Apply
          </button>
        </div>
        <div className="hidden lg:block text-right">
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Active Run</p>
          <p className="max-w-[220px] truncate text-xs text-white/75">{activeRunId || 'No run selected'}</p>
        </div>
        {authState?.status && (
          <div className="hidden xl:block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-widest text-white/70">
            {authState.status}
          </div>
        )}
        <div className="flex gap-4">
          <Settings className="w-6 h-6 text-on-surface-variant cursor-pointer hover:text-primary transition-colors" />
          <Bell className="w-6 h-6 text-on-surface-variant cursor-pointer hover:text-primary transition-colors" />
        </div>
        <button 
          onClick={onStartRun}
          className="bg-primary text-[#005762] font-bold px-6 py-2 rounded-full transition-all hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:-translate-y-0.5 active:scale-95"
        >
          Start Run
        </button>
        <div className="w-10 h-10 rounded-full border border-outline-variant overflow-hidden">
          <img alt="User profile" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB2RFqvqQjCnA_qlOLT8i0GBPfRjSOYikAEQZtA5gHWfKYJuFxy6MKGAJlT0YHfoy5EXLWdzfbJpDn-z6mkRIvdIUcED54NY-NT-DwQckHt9hLDDxrCqTkE9n-Zg3reV1m36P_Y_ROjh-VazwmbKhaeAXvpL9o--Qly5V8E3CTfj4TJt_X8ujpJ7jGwdjOABWLNYSoDe8FO88UJoS8zUbA6jVT3h-tvWHuKcnoiAXbP57Gc5M_RB3IrTxjksFZUcQF-6P5xKQNF4KM" className="w-full h-full object-cover" />
        </div>
      </div>
    </nav>
  );
}
