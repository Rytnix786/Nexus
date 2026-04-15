import React from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import MissionControl from './components/MissionControl';
import TraceTimeline from './components/TraceTimeline';
import RunExplorer from './components/RunExplorer';
import AgentPool from './components/AgentPool';
import SettingsPanel from './components/SettingsPanel';
import ModelsPanel from './components/ModelsPanel';
import LibraryPanel from './components/LibraryPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { NexusAppProvider, useNexusApp } from './state/NexusAppContext';

function AppShell() {
  const {
    currentTab,
    setCurrentTab,
    authToken,
    authTokenDraft,
    isDeveloperMode,
    setAuthTokenDraft,
    authState,
    applyAuthToken,
    recentRuns,
    recentRunsLoading,
    runExplorerTotal,
    runExplorerPage,
    setRunExplorerPage,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    runsError,
    runStream,
    selectRun,
  } = useNexusApp();

  const shellRunStream = {
    ...runStream,
    startRun: async (payload) => {
      setCurrentTab('active');
      await runStream.startRun(payload);
    },
  };

  return (
    <div className="bg-surface text-on-surface font-body selection:bg-primary/30 min-h-screen">
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onStartRun={() => setCurrentTab('dashboard')}
        authState={authState}
        activeRunId={runStream.runId}
        authTokenDraft={authTokenDraft}
        onAuthTokenDraftChange={setAuthTokenDraft}
        onApplyAuthToken={() => void applyAuthToken(authTokenDraft)}
      />
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        recentRuns={recentRuns}
        recentRunsLoading={recentRunsLoading}
        selectedRunId={runStream.runId}
        onSelectRun={selectRun}
        authState={authState}
        authToken={authToken}
      />

      <main className="ml-72 pt-20 h-screen overflow-hidden neural-bg relative">
        {runsError && (
          <div className="mx-auto w-full max-w-7xl px-8 pt-4 text-sm text-rose-200">
            {runsError}
          </div>
        )}

        {currentTab === 'dashboard' && (
          <ErrorBoundary>
            <MissionControl
              runStream={shellRunStream}
              authState={authState}
              isDeveloperMode={isDeveloperMode}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'active' && (
          <ErrorBoundary>
            <TraceTimeline runStream={shellRunStream} />
          </ErrorBoundary>
        )}

        {currentTab === 'history' && (
          <div className="p-8 h-full overflow-y-auto custom-scrollbar relative z-10 w-full max-w-7xl mx-auto">
            <ErrorBoundary>
              <RunExplorer
                searchText={searchText}
                setSearchText={setSearchText}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                recentRuns={recentRuns}
                runId={runStream.runId}
                onSelectRun={selectRun}
                runExplorerPage={runExplorerPage}
                setRunExplorerPage={setRunExplorerPage}
                runExplorerTotal={runExplorerTotal}
                perPage={12}
                onStopRun={runStream.stopTargetRun}
                stoppingRunId={runStream.stoppingRunId}
              />
            </ErrorBoundary>
          </div>
        )}

        {currentTab === 'agents' && (
          <ErrorBoundary>
            <AgentPool />
          </ErrorBoundary>
        )}
        {currentTab === 'settings' && (
          <ErrorBoundary>
            <SettingsPanel />
          </ErrorBoundary>
        )}
        {currentTab === 'models' && (
          <ErrorBoundary>
            <ModelsPanel />
          </ErrorBoundary>
        )}
        {currentTab === 'library' && (
          <ErrorBoundary>
            <LibraryPanel />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <NexusAppProvider>
      <AppShell />
    </NexusAppProvider>
  );
}
