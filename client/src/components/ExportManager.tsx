/**
 * Export Manager Component
 * Handles data export functionality with format selection, filtering, and history tracking
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileJson, FileText, Calendar, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface ExportHistory {
  id: string;
  dataType: string;
  format: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  status: "completed" | "failed" | "pending";
}

interface ExportStatistics {
  totalExports: number;
  totalDataExported: number;
  averageFileSize: number;
  mostUsedFormat: string;
  lastExportDate: string;
}

export function ExportManager() {
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [dataType, setDataType] = useState<"audit_logs" | "users" | "tasks" | "notifications">("tasks");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<"daily" | "weekly" | "monthly">("weekly");

  // Mock data for export history and statistics
  const exportHistory: ExportHistory[] = [
    {
      id: "1",
      dataType: "tasks",
      format: "json",
      fileName: "tasks_2026-03-17.json",
      fileSize: 1024000,
      createdAt: "2026-03-17T10:30:00Z",
      status: "completed",
    },
    {
      id: "2",
      dataType: "audit_logs",
      format: "csv",
      fileName: "audit_logs_2026-03-16.csv",
      fileSize: 512000,
      createdAt: "2026-03-16T14:15:00Z",
      status: "completed",
    },
    {
      id: "3",
      dataType: "notifications",
      format: "json",
      fileName: "notifications_2026-03-15.json",
      fileSize: 256000,
      createdAt: "2026-03-15T09:45:00Z",
      status: "completed",
    },
  ];

  const exportStats: ExportStatistics = {
    totalExports: 42,
    totalDataExported: 15728640,
    averageFileSize: 374491,
    mostUsedFormat: "json",
    lastExportDate: "2026-03-17T10:30:00Z",
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Simulate export API call
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Create download link
      const fileName = `${dataType}_${format(new Date(), "yyyy-MM-dd")}.${exportFormat}`;
      const mockData = JSON.stringify({ dataType, format: exportFormat, startDate, endDate });
      const blob = new Blob([mockData], { type: exportFormat === "json" ? "application/json" : "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="export" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="export">Export Data</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Export Data</CardTitle>
              <CardDescription>Select data type, format, and date range for export</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Data Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Type</label>
                <Select value={dataType} onValueChange={(value: any) => setDataType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tasks">Tasks</SelectItem>
                    <SelectItem value="audit_logs">Audit Logs</SelectItem>
                    <SelectItem value="users">Users</SelectItem>
                    <SelectItem value="notifications">Notifications</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Export Format Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Export Format</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setExportFormat("json")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                      exportFormat === "json"
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <FileJson className="w-4 h-4" />
                    JSON
                  </button>
                  <button
                    onClick={() => setExportFormat("csv")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                      exportFormat === "csv"
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    CSV
                  </button>
                </div>
              </div>

              {/* Date Range Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    End Date
                  </label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Recurring Export Configuration */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="recurring"
                    checked={recurringEnabled}
                    onChange={(e) => setRecurringEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="recurring" className="text-sm font-medium">
                    Enable Recurring Export
                  </label>
                </div>
                {recurringEnabled && (
                  <Select value={recurringInterval} onValueChange={(value: any) => setRecurringInterval(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Export Button */}
              <Button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full"
                size="lg"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export Data
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Export History</CardTitle>
              <CardDescription>View and manage your previous exports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {exportHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {item.status === "completed" && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {item.status === "failed" && (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{item.fileName}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(item.createdAt), "MMM dd, yyyy HH:mm")} • {formatFileSize(item.fileSize)}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Exports</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{exportStats.totalExports}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Data Exported</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatFileSize(exportStats.totalDataExported)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Average File Size</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatFileSize(exportStats.averageFileSize)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Most Used Format</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold uppercase">{exportStats.mostUsedFormat}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Export Trends</CardTitle>
              <CardDescription>Last export: {format(new Date(exportStats.lastExportDate), "MMM dd, yyyy HH:mm")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                You have successfully exported {exportStats.totalExports} datasets totaling {formatFileSize(exportStats.totalDataExported)}.
                Your most frequently used format is {exportStats.mostUsedFormat.toUpperCase()}.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
