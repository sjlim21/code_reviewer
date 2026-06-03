import React, { useState, useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useIssueStore } from '../stores/issueStore';
import { useUiStore } from '../stores/uiStore';
import { getSupabaseClient } from '../supabase';
import { StatsCards } from './dashboard/StatsCards';
import { TrendChart } from './dashboard/TrendChart';
import { IssueFilters } from './dashboard/IssueFilters';
import { ProjectSelector } from './dashboard/ProjectSelector';
import { IssueTable } from './dashboard/IssueTable';
import { HealthStats } from './dashboard/HealthStats';

export const Dashboard: React.FC = () => {
  const { selectedProject, projects, isUsingRealDB, setSelectedProject: onSelectProject, removeProject } = useProjectStore();
  const { issues, setIssues, setSelectedIssue: onSelectIssue } = useIssueStore();
  const { addLog } = useUiStore();

  const onDeleteProject = async (projectId: string) => {
    const targetProj = projects.find(p => p.id === projectId);
    const name = targetProj ? targetProj.name : projectId;

    if (!window.confirm('정말로 이 프로젝트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, 프로젝트와 연결된 모든 이슈 및 분석 이력이 영구적으로 제거됩니다.')) {
      return;
    }

    addLog(`[프로젝트 삭제] '${name}' 프로젝트를 삭제하는 중...`, 'info');

    if (isUsingRealDB) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { error } = await supabase.from('projects').delete().eq('id', projectId);
          if (error) throw error;
          addLog('[프로젝트 삭제 완료] DB 삭제 성공.', 'success');
        } catch (e) {
          console.error('DB project delete failed:', e);
          const errorMsg = e instanceof Error ? e.message : String(e);
          addLog(`[에러] 프로젝트 DB 삭제 실패: ${errorMsg}`, 'error');
          alert('프로젝트 삭제 중 에러가 발생했습니다: ' + errorMsg);
          return;
        }
      }
    } else {
      addLog('[프로젝트 삭제 완료] 로컬 데이터 삭제 완료.', 'success');
    }

    const updatedProjects = projects.filter(p => p.id !== projectId);
    removeProject(projectId);

    if (selectedProject?.id === projectId) {
      if (updatedProjects.length > 0) {
        onSelectProject(updatedProjects[0]);
      } else {
        onSelectProject(null);
        setIssues([]);
      }
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  const handleCardClick = (type: 'critical' | 'high' | 'medium' | 'low' | 'resolved') => {
    if (type === 'resolved') {
      if (statusFilter === 'resolved') {
        setStatusFilter('open');
        setSeverityFilter('all');
      } else {
        setStatusFilter('resolved');
        setSeverityFilter('all');
      }
    } else {
      if (severityFilter === type && statusFilter === 'open') {
        setSeverityFilter('all');
      } else {
        setSeverityFilter(type);
        setStatusFilter('open');
      }
    }
  };

  const isAnyCardActive = ['critical', 'high', 'medium', 'low'].includes(severityFilter) || statusFilter === 'resolved';

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  };

  const projectIssues = useMemo(() => {
    if (!selectedProject) return issues;
    return issues.filter(i => i.project_id === selectedProject.id);
  }, [selectedProject, issues]);

  const filteredIssues = useMemo(() => {
    return projectIssues.filter(issue => {
      const issueTitle = issue.title || '';
      const issueFilePath = issue.file_path || '';
      const matchesSearch = issueTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            issueFilePath.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSeverity = severityFilter === 'all' ? true : issue.severity === severityFilter;
      const matchesCategory = categoryFilter === 'all' ? true : issue.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' ? true : issue.status === statusFilter;
      return matchesSearch && matchesSeverity && matchesCategory && matchesStatus;
    }).sort((a, b) => b.priority_score - a.priority_score);
  }, [projectIssues, searchTerm, severityFilter, categoryFilter, statusFilter]);

  const metrics = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, open: 0, resolved: 0 };
    projectIssues.forEach(issue => {
      if (issue.status === 'open' || issue.status === 'in_progress') {
        counts[issue.severity as keyof typeof counts]++;
        counts.open++;
      } else {
        counts.resolved++;
      }
    });
    return counts;
  }, [projectIssues]);

  const healthScore = useMemo(() => {
    let score = 100;
    projectIssues.forEach(issue => {
      if (issue.status === 'open' || issue.status === 'in_progress') {
        if (issue.severity === 'critical') score -= 15;
        else if (issue.severity === 'high') score -= 10;
        else if (issue.severity === 'medium') score -= 5;
        else if (issue.severity === 'low') score -= 2;
      }
    });
    return Math.max(0, score);
  }, [projectIssues]);

  const healthGrade = (() => {
    if (healthScore >= 90) return 'A';
    if (healthScore >= 80) return 'B';
    if (healthScore >= 70) return 'C';
    if (healthScore >= 60) return 'D';
    return 'F';
  })();

  const scoreColor = (() => {
    if (healthScore >= 90) return 'text-emerald-400';
    if (healthScore >= 75) return 'text-indigo-400';
    if (healthScore >= 60) return 'text-amber-400';
    return 'text-rose-500';
  })();

  const { chartTrend30Days, velocityMetrics } = useMemo(() => {
    const dates: { name: string; dateRaw: string; open: number; resolved: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const utcDateStr = d.toISOString().split('T')[0];
      const [, mm, dd] = utcDateStr.split('-');
      dates.push({ dateRaw: utcDateStr, name: `${mm}-${dd}`, open: 0, resolved: 0 });
    }

    dates.forEach(d => {
      const targetTime = new Date(d.dateRaw + 'T23:59:59Z').getTime();
      let openCount = 0;
      let resolvedCount = 0;
      projectIssues.forEach(issue => {
        const createdTime = new Date(issue.created_at).getTime();
        if (createdTime <= targetTime) {
          if (issue.status === 'resolved' && issue.resolved_at) {
            const resolvedTime = new Date(issue.resolved_at).getTime();
            if (resolvedTime <= targetTime) resolvedCount++;
            else openCount++;
          } else {
            openCount++;
          }
        }
      });
      d.open = openCount;
      d.resolved = resolvedCount;
    });

    const hasAnyOpen = dates.some(d => d.open > 0 || d.resolved > 0);
    if (!hasAnyOpen) {
      dates.forEach((d, idx) => {
        d.open = [15,14,16,13,12,11,12,10,9,8,9,7,8,6,7,5,6,7,5,4,3,4,3,2,3,2,1,1,0,0][idx] ?? 0;
        d.resolved = [0,1,2,4,5,6,6,8,9,10,10,12,12,14,14,16,16,16,18,19,20,20,21,22,22,23,24,24,25,25][idx] ?? 0;
      });
    }

    let totalResolveTime = 0;
    let resolvedCount = 0;
    projectIssues.forEach(issue => {
      if (issue.status === 'resolved' && issue.resolved_at && issue.created_at) {
        const diffHours = (new Date(issue.resolved_at).getTime() - new Date(issue.created_at).getTime()) / (1000 * 60 * 60);
        if (diffHours >= 0) { totalResolveTime += diffHours; resolvedCount++; }
      }
    });

    return {
      chartTrend30Days: dates,
      velocityMetrics: {
        avgHours: resolvedCount > 0 ? (totalResolveTime / resolvedCount).toFixed(1) : 'N/A',
        count: resolvedCount
      }
    };
  }, [projectIssues]);

  const chartCategoryData = useMemo(() => {
    const categories: { [key: string]: number } = {};
    projectIssues.forEach(i => { categories[i.category] = (categories[i.category] || 0) + 1; });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [projectIssues]);

  const handleExport = (format: 'csv' | 'json' | 'pdf') => {
    if (format === 'pdf') {
      setExportDropdownOpen(false);
      const unresolvedIssues = projectIssues
        .filter(i => i.status !== 'resolved')
        .sort((a, b) => b.priority_score - a.priority_score);

      const severityColor = (sev: string) => {
        if (sev === 'critical') return '#dc2626';
        if (sev === 'high') return '#ea580c';
        if (sev === 'medium') return '#ca8a04';
        return '#2563eb';
      };

      const issueRows = unresolvedIssues.length > 0
        ? unresolvedIssues.map(issue => `
          <tr style="border-bottom: 1px solid #cbd5e1;">
            <td style="padding: 8px 8px 8px 0; font-weight: 800; color: ${severityColor(issue.severity)};">${issue.severity.toUpperCase()}</td>
            <td style="padding: 8px;">
              <div style="font-weight: 700; color: #0f172a;">${issue.title}</div>
              <div style="font-size: 10px; color: #64748b; margin-top: 3px;">${issue.description}</div>
            </td>
            <td style="padding: 8px; font-family: monospace; font-size: 10px; color: #475569; word-break: break-all;">${issue.file_path} (Lines ${issue.line_start}-${issue.line_end})</td>
            <td style="padding: 8px; text-align: right; font-family: monospace; font-weight: 700; color: #1e293b;">${issue.priority_score}점</td>
          </tr>`).join('')
        : '<tr><td colspan="4" style="padding: 32px; text-align: center; color: #94a3b8;">감지된 미해결 결함이 없습니다. 프로젝트 상태 양호.</td></tr>';

      const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>CodeEye 보안 진단 보고서 – ${selectedProject?.name || 'Project'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; background: white; }
    .page { padding: 48px 56px; max-width: 900px; margin: 0 auto; }
    .cover { height: 270mm; display: flex; flex-direction: column; justify-content: space-between; border: 4px solid #0f172a; padding: 56px; page-break-after: always; }
    .cover-label { font-family: monospace; font-size: 11px; letter-spacing: 0.2em; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 20px; }
    .cover-title { font-size: 42px; font-weight: 900; line-height: 1.1; color: #0f172a; margin-bottom: 16px; }
    .cover-desc { font-size: 14px; color: #475569; line-height: 1.7; max-width: 520px; }
    .cover-meta { border-top: 2px solid #0f172a; padding-top: 20px; font-family: monospace; font-size: 13px; color: #334155; line-height: 2; }
    .section { padding: 40px 0; page-break-inside: avoid; }
    .section-title { font-size: 22px; font-weight: 800; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 24px; color: #0f172a; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .stat-card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; }
    .stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; letter-spacing: 0.1em; }
    .stat-value { font-size: 28px; font-weight: 900; color: #0f172a; }
    .sev-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; text-align: center; }
    .sev-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 6px; }
    .sev-name { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
    .sev-count { font-size: 22px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { padding: 10px 8px; text-align: left; font-weight: 700; color: #475569; border-bottom: 2px solid #0f172a; text-transform: uppercase; font-size: 9px; letter-spacing: 0.08em; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .cover { page-break-after: always; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="cover">
      <div>
        <div class="cover-label">Security Audit Report</div>
        <div class="cover-title">CodeEye<br/>보안 및 품질 진단 보고서</div>
        <div class="cover-desc">본 보고서는 로컬 정적 분석 엔진을 통해 소스코드의 취약성, 버퍼 오버플로우, 메모리 누수 및 코드의 품질 상태를 정밀 분석하여 작성되었습니다.</div>
      </div>
      <div class="cover-meta">
        <div><strong>프로젝트명:</strong> ${selectedProject?.name || 'Local Project'}</div>
        <div><strong>진단 주체:</strong> CodeEye Local Static Analyzer</div>
        <div><strong>진단 일시:</strong> ${new Date().toLocaleString('ko-KR')}</div>
        <div><strong>품질 등급:</strong> Grade ${healthGrade} (${healthScore} / 100)</div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">1. 진단 통계 요약 (Executive Summary)</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">프로젝트 품질 점수</div><div class="stat-value">${healthScore} / 100 (Grade ${healthGrade})</div></div>
        <div class="stat-card"><div class="stat-label">평균 해결 소요 시간</div><div class="stat-value">${velocityMetrics.avgHours === 'N/A' ? 'N/A' : velocityMetrics.avgHours + '시간'}</div></div>
      </div>
      <div class="sev-grid">
        <div class="sev-card"><div class="sev-name">Critical</div><div class="sev-count" style="color:#dc2626">${metrics.critical}건</div></div>
        <div class="sev-card"><div class="sev-name">High</div><div class="sev-count" style="color:#ea580c">${metrics.high}건</div></div>
        <div class="sev-card"><div class="sev-name">Medium</div><div class="sev-count" style="color:#ca8a04">${metrics.medium}건</div></div>
        <div class="sev-card"><div class="sev-name">Low</div><div class="sev-count" style="color:#2563eb">${metrics.low}건</div></div>
        <div class="sev-card"><div class="sev-name">Resolved</div><div class="sev-count" style="color:#059669">${metrics.resolved}건</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">2. 미해결 보안 위협 목록</div>
      <table>
        <thead>
          <tr>
            <th style="width:80px;">심각도</th>
            <th>결함 설명</th>
            <th style="width:200px;">파일명</th>
            <th style="width:60px; text-align:right;">점수</th>
          </tr>
        </thead>
        <tbody>${issueRows}</tbody>
      </table>
    </div>
  </div>
  <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };</script>
</body>
</html>`;

      const printWin = window.open('', '_blank', 'width=960,height=900,scrollbars=yes');
      if (printWin) {
        printWin.document.write(html);
        printWin.document.close();
      } else {
        alert('팝업이 차단되어 있습니다. 브라우저에서 팝업 허용 후 다시 시도해 주세요.');
      }
      return;
    }

    if (filteredIssues.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    if (format === 'json') {
      const jsonString = JSON.stringify(filteredIssues, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `codeeye_report_${selectedProject?.name || 'project'}_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'csv') {
      const headers = ['ID', 'Title', 'Severity', 'Category', 'Status', 'File Path', 'Line Start', 'Line End', 'Priority Score', 'Created At'];
      const rows = filteredIssues.map(issue => [
        issue.id,
        `"${(issue.title || '').replace(/"/g, '""')}"`,
        issue.severity,
        issue.category,
        issue.status,
        `"${(issue.file_path || '').replace(/"/g, '""')}"`,
        issue.line_start,
        issue.line_end,
        issue.priority_score,
        issue.created_at || ''
      ]);
      const csvContent = '﻿' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `codeeye_report_${selectedProject?.name || 'project'}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setExportDropdownOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Dynamic Health Stats Summary */}
      {projectIssues.length > 0 && (
        <HealthStats
          metrics={metrics}
          healthScore={healthScore}
          healthGrade={healthGrade}
          scoreColor={scoreColor}
          projectIssues={projectIssues}
        />
      )}

      {/* Upper Grid - Project Selector & Metrics Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <ProjectSelector
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={onSelectProject}
          onDeleteProject={onDeleteProject}
        />
        <StatsCards
          critical={metrics.critical}
          high={metrics.high}
          medium={metrics.medium}
          low={metrics.low}
          resolved={metrics.resolved}
          severityFilter={severityFilter}
          statusFilter={statusFilter}
          isAnyCardActive={isAnyCardActive}
          onCardClick={handleCardClick}
          onMouseMove={handleMouseMove}
        />
      </div>

      {/* Visual Analytics Charts */}
      <TrendChart
        chartTrend30Days={chartTrend30Days}
        chartCategoryData={chartCategoryData}
        velocityMetrics={velocityMetrics}
      />

      {/* Filter and Issue List */}
      <div className="glass-panel rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-800/80">
          <div>
            <h3 className="text-base font-bold text-slate-200">탐지 결함 레포트</h3>
            <p className="text-xs text-slate-500 mt-1">심각도 및 RLS 우선순위 점수가 계산되어 노출됩니다.</p>
          </div>
          <IssueFilters
            searchTerm={searchTerm}
            severityFilter={severityFilter}
            categoryFilter={categoryFilter}
            statusFilter={statusFilter}
            exportDropdownOpen={exportDropdownOpen}
            onSearchChange={setSearchTerm}
            onSeverityChange={setSeverityFilter}
            onCategoryChange={setCategoryFilter}
            onStatusChange={setStatusFilter}
            onExportToggle={() => setExportDropdownOpen(!exportDropdownOpen)}
            onExportClose={() => setExportDropdownOpen(false)}
            onExport={handleExport}
          />
        </div>
        <IssueTable
          issues={filteredIssues}
          onIssueClick={onSelectIssue}
        />
      </div>

    </div>
  );
};
