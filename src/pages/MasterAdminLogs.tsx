import React, { useState, useEffect } from "react";
import { Terminal, Search, Filter, AlertCircle, Info, AlertTriangle, ShieldAlert, Clock, Church, User, Globe, RefreshCcw, ArrowLeft, X } from "lucide-react";
import { getCollection, subscribeToCollection } from "../lib/firestore";
import { orderBy, limit } from "firebase/firestore";
import { showErrorToast } from "../lib/error-handler";
import { motion, AnimatePresence } from "motion/react";
import { format, parseISO } from "date-fns";
import { Link } from "react-router-dom";

export default function MasterAdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  useEffect(() => {
    // Subscribe to latest 100 logs
    let unsub: () => void = () => {};
    
    try {
      unsub = subscribeToCollection("logs", [
        orderBy("timestamp", "desc"),
        limit(100)
      ], (data) => {
        setLogs(data);
        setLoading(false);
      });
    } catch (err) {
      console.error("Subscription failed:", err);
      showErrorToast(err);
      setLoading(false);
    }
    
    return () => unsub();
  }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const data = await getCollection("logs");
      const sorted = [...data].sort((a: any, b: any) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setLogs(sorted);
      setLoading(false);
    } catch (error) {
      console.error("Load logs error:", error);
      showErrorToast(error);
      setLoading(false);
    }
  }

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.churchId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLevel = levelFilter === "all" || log.level === levelFilter;
    const matchesSource = sourceFilter === "all" || log.source === sourceFilter;
    
    return matchesSearch && matchesLevel && matchesSource;
  });

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'critical': return <ShieldAlert className="h-4 w-4 text-red-600" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warn': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
      default: return <Terminal className="h-4 w-4 text-gray-500" />;
    }
  };

  const getLevelStyles = (level: string) => {
    switch (level) {
      case 'critical': return "bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
      case 'error': return "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800";
      case 'warn': return "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800";
      case 'info': return "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
      default: return "bg-gray-50 text-gray-700 border-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <Link to="/master-admin" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="h-6 w-6 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">System Logs</h1>
            <p className="text-gray-500 dark:text-gray-400">Trace errors and monitor platform health</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={loadLogs}
            className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCcw className={`h-5 w-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col lg:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search message, userId, churchId..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-4 w-full lg:w-auto">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm min-w-[120px]"
            >
              <option value="all">All Levels</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <Globe className="h-4 w-4 text-gray-400" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm min-w-[120px]"
            >
              <option value="all">All Sources</option>
              <option value="client">Client</option>
              <option value="server">Server</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider w-12">Level</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Message</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Church Context</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr 
                    key={log.id} 
                    className={`group hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors ${log.level === 'critical' ? 'bg-red-50/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className={`inline-flex p-1.5 rounded-lg border ${getLevelStyles(log.level)}`} title={log.level}>
                        {getLevelIcon(log.level)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-xs text-gray-500 whitespace-nowrap">
                        <Clock className="h-3 w-3 mr-1 opacity-50" />
                        {log.timestamp ? format(parseISO(log.timestamp), "MMM dd, HH:mm:ss") : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-md">
                        <p className={`text-sm font-medium transition-colors ${log.level === 'error' || log.level === 'critical' ? 'text-red-900 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                          {log.message}
                        </p>
                        {log.url && (
                          <p className="text-[10px] text-gray-400 truncate mt-1">
                            {log.url}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {log.churchId ? (
                        <div className="flex items-center text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md w-fit">
                          <Church className="h-3 w-3 mr-1" />
                          {log.churchId.substring(0, 8)}...
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">Global</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {log.userId ? (
                        <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                          <User className="h-3 w-3 mr-1 opacity-50" />
                          <span title={log.userId}>{log.userId.substring(0, 8)}...</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">System</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => setSelectedLog(log)}
                        className="text-primary hover:underline text-xs font-bold"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No logs found matching your criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Details Modal */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-xl border ${getLevelStyles(selectedLog.level)}`}>
                    {getLevelIcon(selectedLog.level)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Log Details</h2>
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">{selectedLog.level} from {selectedLog.source}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Metadata</h3>
                    <div className="space-y-3">
                      <MetaItem label="Timestamp" value={selectedLog.timestamp ? format(parseISO(selectedLog.timestamp), "yyyy-MM-dd HH:mm:ss.SSS") : 'N/A'} />
                      <MetaItem label="Log ID" value={selectedLog.id} />
                      <MetaItem label="User Context" value={selectedLog.userId || 'N/A'} />
                      <MetaItem label="Church Context" value={selectedLog.churchId || 'N/A'} />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Environment</h3>
                    <div className="space-y-3">
                      <MetaItem label="URL" value={selectedLog.url || 'N/A'} isCode />
                      <MetaItem label="User Agent" value={selectedLog.userAgent || 'N/A'} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Message</h3>
                  <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <pre className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono leading-relaxed">
                      {selectedLog.message}
                    </pre>
                  </div>
                </div>

                {(selectedLog.context || selectedLog.stack) && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Debugging Context</h3>
                    <div className="space-y-4">
                      {selectedLog.context && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Variables</p>
                          <div className="p-6 bg-gray-900 rounded-2xl overflow-auto border border-gray-800">
                            <pre className="text-xs text-green-400 font-mono italic">
                              {JSON.stringify(selectedLog.context, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                      
                      {selectedLog.stack && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Stack Trace</p>
                          <div className="p-6 bg-red-950/20 rounded-2xl overflow-auto border border-red-900/10">
                            <pre className="text-xs text-red-500/80 font-mono leading-tight">
                              {selectedLog.stack}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetaItem({ label, value, isCode }: { label: string, value: string, isCode?: boolean }) {
  return (
    <div className="flex flex-col space-y-1">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{label}</span>
      <span className={`text-sm text-gray-700 dark:text-gray-300 break-all ${isCode ? 'font-mono bg-gray-50 dark:bg-gray-800 px-1 rounded' : ''}`}>{value}</span>
    </div>
  );
}
