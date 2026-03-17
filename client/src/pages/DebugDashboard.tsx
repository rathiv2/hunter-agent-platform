/**
 * Debug Dashboard Page
 * Displays detailed execution logs and debug information
 */

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2, Download, Trash2, Search, Filter } from "lucide-react";

interface DebugLog {
  id: number;
  taskId: number;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  category: string;
  message: string;
  context: Record<string, any> | null;
  metadata: Record<string, any> | null;
  stackTrace?: string;
  duration?: number;
  createdAt: Date;
}

interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  averageDuration: number;
}

const levelColors: Record<string, string> = {
  debug: "bg-gray-100 text-gray-800",
  info: "bg-blue-100 text-blue-800",
  warn: "bg-yellow-100 text-yellow-800",
  error: "bg-red-100 text-red-800",
  fatal: "bg-red-200 text-red-900",
};

const levelBgColors: Record<string, string> = {
  debug: "#6b7280",
  info: "#3b82f6",
  warn: "#f59e0b",
  error: "#ef4444",
  fatal: "#dc2626",
};

export default function DebugDashboard() {
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();

  // Fetch logs
  const { data: userLogs, isLoading: logsLoading, refetch: refetchLogs } = trpc.debugLogs.getUserLogs.useQuery({
    level: selectedLevel as any,
    category: selectedCategory,
    days: 7,
    limit: 100,
  });

  const { data: taskLogs } = trpc.debugLogs.getTaskLogs.useQuery(
    selectedTaskId ? { taskId: selectedTaskId, limit: 100 } : { taskId: 0, limit: 100 },
    { enabled: !!selectedTaskId }
  );

  // Fetch stats
  const { data: logStats } = trpc.debugLogs.getLogStats.useQuery({
    taskId: selectedTaskId,
    days: 7,
  });

  // Search logs
  const { data: searchResults } = trpc.debugLogs.searchLogs.useQuery(
    searchQuery ? { query: searchQuery, taskId: selectedTaskId, limit: 50 } : { query: "", limit: 50 },
    { enabled: searchQuery.length > 0 }
  );

  // Export logs
  const exportMutation = trpc.debugLogs.exportLogs.useMutation();
  const handleExport = async (format: "json" | "csv") => {
    const result = await exportMutation.mutateAsync({
      taskId: selectedTaskId,
      format,
      days: 7,
    });
    
    // Create download link
    const element = document.createElement("a");
    element.setAttribute("href", `data:text/plain;charset=utf-8,${encodeURIComponent(result.data)}`);
    element.setAttribute("download", result.filename);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Delete logs
  const deleteMutation = trpc.debugLogs.deleteLogs.useMutation();
  const handleDeleteOldLogs = async () => {
    if (confirm("Are you sure you want to delete logs older than 30 days?")) {
      await deleteMutation.mutateAsync({
        taskId: selectedTaskId,
        olderThanDays: 30,
      });
      refetchLogs();
    }
  };

  const logsToDisplay = searchQuery ? searchResults : selectedTaskId ? taskLogs : userLogs;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Debug Dashboard</h1>
          <p className="text-muted-foreground">View detailed execution logs and debug information</p>
        </div>

        {/* Statistics Cards */}
        {logStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{logStats.total}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{logStats.byLevel.error + logStats.byLevel.fatal}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Warnings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{logStats.byLevel.warn}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{logStats.averageDuration}ms</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Object.keys(logStats.byCategory).length}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters and Controls */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filters & Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Search</label>
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Log Level</label>
                <select
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  value={selectedLevel || ""}
                  onChange={(e) => setSelectedLevel(e.target.value || undefined)}
                >
                  <option value="">All Levels</option>
                  <option value="debug">Debug</option>
                  <option value="info">Info</option>
                  <option value="warn">Warning</option>
                  <option value="error">Error</option>
                  <option value="fatal">Fatal</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Category</label>
                <select
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  value={selectedCategory || ""}
                  onChange={(e) => setSelectedCategory(e.target.value || undefined)}
                >
                  <option value="">All Categories</option>
                  <option value="agent_loop">Agent Loop</option>
                  <option value="tool_execution">Tool Execution</option>
                  <option value="memory">Memory</option>
                  <option value="error_recovery">Error Recovery</option>
                  <option value="scheduling">Scheduling</option>
                  <option value="api">API</option>
                  <option value="database">Database</option>
                  <option value="websocket">WebSocket</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <Button onClick={() => handleExport("json")} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  JSON
                </Button>
                <Button onClick={() => handleExport("csv")} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
                <Button onClick={handleDeleteOldLogs} variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clean
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        {logStats && (
          <Tabs defaultValue="overview" className="space-y-4 mb-8">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle>Logs by Level</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={Object.entries(logStats.byLevel).map(([level, count]) => ({
                        name: level,
                        count,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="categories">
              <Card>
                <CardHeader>
                  <CardTitle>Logs by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={Object.entries(logStats.byCategory).map(([category, count]) => ({
                          name: category,
                          value: count,
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {Object.keys(logStats.byCategory).map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"][index % 8]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Debug Logs</CardTitle>
            <CardDescription>Detailed execution traces and debug information</CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : logsToDisplay && logsToDisplay.length > 0 ? (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {logsToDisplay.map((log: any) => (
                  <div key={log.id} className="border rounded-lg p-4 hover:bg-muted/50 transition">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={levelColors[log.level]}>{log.level.toUpperCase()}</Badge>
                        <Badge variant="outline">{log.category}</Badge>
                        {log.duration && <Badge variant="secondary">{log.duration}ms</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="font-medium text-foreground mb-1">{log.message}</p>
                    {log.metadata && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">Metadata</summary>
                        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                    {log.stackTrace && (
                      <details className="text-xs text-red-600 mt-2">
                        <summary className="cursor-pointer hover:text-red-700">Stack Trace</summary>
                        <pre className="mt-2 p-2 bg-red-50 rounded text-xs overflow-x-auto">
                          {log.stackTrace}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No logs found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
