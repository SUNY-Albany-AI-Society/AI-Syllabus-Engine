'use client';

import { useState } from 'react';

const TIERS = [
  'Tier 1: Strictly Prohibited',
  'Tier 2: Brainstorming Permitted',
  'Tier 3: Full AI Permitted',
  'Tier 4: Permitted with Mandatory Disclosure',
];

type Task = {
  title: string;
  recommended_tier: string;
  current_tier: string;
  is_overridden: boolean;
  rationale: string;
  acceptable_use: string;
};

type Module = {
  label: string;
  title: string;
  recommended_tier: string;
  current_tier: string;
  is_overridden: boolean;
  rationale: string;
  tasks: Task[];
};

type CourseMeta = {
  code: string;
  title: string;
  instructor: string;
  term: string;
  department: string;
};

type Payload = {
  course: CourseMeta;
  course_summary: string;
  policy_statement: string;
  disclosure_statement: string;
  equity_statement: string;
  tier_definitions: { tier: string; definition: string }[];
  modules: Module[];
};

const PURPLE = '#46166B';
const GOLD = '#EEB211';

export default function SyllabusWizard() {
  const [session, setSession] = useState<{ user: { name: string; email: string } } | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [step, setStep] = useState(1);
  const [wishList, setWishList] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState('CIST 601');
  const [department, setDepartment] = useState('Information Science');
  const [loading, setLoading] = useState(false);

  const [payload, setPayload] = useState<Payload | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [source, setSource] = useState<'live' | 'fallback' | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [extractedNote, setExtractedNote] = useState('');
  const [extractedPreview, setExtractedPreview] = useState('');
  const [showSource, setShowSource] = useState(false);

  const [hitl, setHitl] = useState<{
    open: boolean;
    moduleIndex: number | null;
    taskIndex: number | null;
    pendingTier: string;
    label: string;
  }>({ open: false, moduleIndex: null, taskIndex: null, pendingTier: '', label: '' });

  const handleSimulatedLogin = () => {
    if (!emailInput.endsWith('@albany.edu')) {
      setAuthError('Access Denied: Please authenticate with a valid @albany.edu enterprise email.');
      return;
    }
    setLoading(true);
    setAuthError('');
    const raw = emailInput.split('@')[0];
    const mockName = raw.charAt(0).toUpperCase() + raw.slice(1);
    setTimeout(() => {
      setSession({ user: { name: mockName, email: emailInput } });
      setLoading(false);
    }, 600);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    const fd = new FormData();
    fd.append('course', course);
    fd.append('department', department);
    if (file) fd.append('file', file);
    if (wishList) fd.append('wishList', wishList);

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: fd });
      const json = await res.json();

      setSource(json.source ?? null);
      setSourceError(json.error ?? null);
      setExtractedNote(json.extracted_note ?? '');
      setExtractedPreview(json.extracted_preview ?? '');

      const data: Payload = json.data;
      setPayload(data);
      setModules(
        (data.modules || []).map((m) => ({
          ...m,
          current_tier: m.recommended_tier,
          is_overridden: false,
          tasks: (m.tasks || []).map((t) => ({
            ...t,
            current_tier: t.recommended_tier,
            is_overridden: false,
          })),
        }))
      );
      setStep(2);
    } catch (err) {
      console.error(err);
      setSourceError('The request failed before reaching the server.');
      setSource('fallback');
    } finally {
      setLoading(false);
    }
  };

  const applyModuleTier = (mi: number, tier: string, overridden: boolean) => {
    const next = [...modules];
    next[mi] = {
      ...next[mi],
      current_tier: tier,
      is_overridden: overridden,
      tasks: next[mi].tasks.map((t) => ({
        ...t,
        current_tier: tier,
        is_overridden: tier !== t.recommended_tier,
      })),
    };
    setModules(next);
    setHitl({ open: false, moduleIndex: null, taskIndex: null, pendingTier: '', label: '' });
  };

  const applyTaskTier = (mi: number, ti: number, tier: string, overridden: boolean) => {
    const next = [...modules];
    const tasks = [...next[mi].tasks];
    tasks[ti] = { ...tasks[ti], current_tier: tier, is_overridden: overridden };
    next[mi] = { ...next[mi], tasks };
    setModules(next);
    setHitl({ open: false, moduleIndex: null, taskIndex: null, pendingTier: '', label: '' });
  };

  const initiateModuleChange = (mi: number, tier: string) => {
    if (tier === modules[mi].recommended_tier) {
      applyModuleTier(mi, tier, false);
    } else {
      setHitl({
        open: true,
        moduleIndex: mi,
        taskIndex: null,
        pendingTier: tier,
        label: `${modules[mi].label} — ${modules[mi].title} (all tasks)`,
      });
    }
  };

  const initiateTaskChange = (mi: number, ti: number, tier: string) => {
    if (tier === modules[mi].tasks[ti].recommended_tier) {
      applyTaskTier(mi, ti, tier, false);
    } else {
      setHitl({
        open: true,
        moduleIndex: mi,
        taskIndex: ti,
        pendingTier: tier,
        label: modules[mi].tasks[ti].title,
      });
    }
  };

  const overrideCount = modules.reduce(
    (n, m) => n + (m.is_overridden ? 1 : 0) + m.tasks.filter((t) => t.is_overridden).length,
    0
  );

  const buildAddendumHtml = () => {
    if (!payload) return '';
    const c = payload.course;

    const moduleBlocks = modules
      .map(
        (m) => `
      <div style="margin-bottom:22px;page-break-inside:avoid;">
        <h3 style="margin:0 0 6px 0;font-size:15px;color:${PURPLE};border-left:4px solid ${GOLD};padding-left:10px;">
          ${m.label}: ${m.title}
        </h3>
        <p style="margin:0 0 10px 12px;font-size:12px;color:#555;">
          <strong>Module baseline:</strong> ${m.current_tier}${m.is_overridden ? ' (faculty override)' : ''} &mdash; <em>${m.rationale}</em>
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-left:12px;">
          <thead>
            <tr style="background-color:#f2eef6;">
              <th style="padding:8px;text-align:left;border:1px solid #ddd;width:32%;">Task</th>
              <th style="padding:8px;text-align:left;border:1px solid #ddd;width:28%;">Authorized Tier</th>
              <th style="padding:8px;text-align:left;border:1px solid #ddd;width:40%;">What is permitted</th>
            </tr>
          </thead>
          <tbody>
            ${m.tasks
              .map(
                (t) => `
              <tr>
                <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">${t.title}</td>
                <td style="padding:8px;border:1px solid #ddd;color:${PURPLE};">${t.current_tier}${
                  t.is_overridden ? '<br/><span style="font-size:10px;color:#8a6100;">Faculty override</span>' : ''
                }</td>
                <td style="padding:8px;border:1px solid #ddd;">${t.acceptable_use}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
      )
      .join('');

    const tierRows = payload.tier_definitions
      .map(
        (d) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold;width:32%;">${d.tier}</td>
        <td style="padding:8px;border:1px solid #ddd;">${d.definition}</td>
      </tr>`
      )
      .join('');

    return `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#222;line-height:1.55;">
        <div style="text-align:center;border-bottom:3px solid ${GOLD};padding-bottom:14px;margin-bottom:22px;">
          <div style="font-size:11px;letter-spacing:2px;color:${PURPLE};font-weight:bold;">UNIVERSITY AT ALBANY</div>
          <h1 style="margin:8px 0 4px 0;font-size:22px;color:${PURPLE};">Artificial Intelligence Policy Addendum</h1>
          <div style="font-size:13px;color:#444;">
            ${c.code}${c.title ? ` &mdash; ${c.title}` : ''}
          </div>
          <div style="font-size:12px;color:#666;margin-top:4px;">
            ${[c.department, c.term, c.instructor].filter(Boolean).join(' &nbsp;|&nbsp; ')}
          </div>
        </div>

        <p style="font-size:13px;font-style:italic;color:#444;margin-bottom:20px;">${payload.course_summary}</p>

        <h2 style="font-size:15px;color:${PURPLE};border-bottom:1px solid #ddd;padding-bottom:4px;">I. Institutional AI Policy</h2>
        <p style="font-size:13px;">${payload.policy_statement}</p>

        <h2 style="font-size:15px;color:${PURPLE};border-bottom:1px solid #ddd;padding-bottom:4px;">II. Usage Tiers in This Course</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
          <tbody>${tierRows}</tbody>
        </table>

        <h2 style="font-size:15px;color:${PURPLE};border-bottom:1px solid #ddd;padding-bottom:4px;">III. Module and Task Authorizations</h2>
        ${moduleBlocks}

        <h2 style="font-size:15px;color:${PURPLE};border-bottom:1px solid #ddd;padding-bottom:4px;">IV. Disclosure and Citation</h2>
        <p style="font-size:13px;">${payload.disclosure_statement}</p>

        <h2 style="font-size:15px;color:${PURPLE};border-bottom:1px solid #ddd;padding-bottom:4px;">V. Equitable Access</h2>
        <p style="font-size:13px;">${payload.equity_statement}</p>

        <p style="margin-top:32px;font-size:11px;color:#777;border-top:1px solid #ddd;padding-top:10px;">
          Generated by the UAlbany AI Syllabus Engine on ${new Date().toLocaleDateString()}.
          ${overrideCount > 0 ? `${overrideCount} faculty override(s) recorded for departmental review.` : 'No faculty overrides recorded.'}
        </p>
      </div>`;
  };

  const downloadDoc = () => {
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>AI Policy Addendum</title></head>
      <body>${buildAddendumHtml()}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${course.replace(/\s+/g, '_')}_AI_Addendum.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderHitl = () => {
    if (!hitl.open) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full border-t-4 border-amber-500">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Human-in-the-Loop Verification</h3>
          <p className="text-sm text-slate-600 mb-4">
            You are overriding the recommended baseline for <strong>{hitl.label}</strong> and setting it to{' '}
            <strong>{hitl.pendingTier}</strong>. This deviation will be logged for departmental review.
          </p>
          <div className="flex space-x-3 justify-end">
            <button
              onClick={() => setHitl({ open: false, moduleIndex: null, taskIndex: null, pendingTier: '', label: '' })}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (hitl.moduleIndex === null) return;
                if (hitl.taskIndex === null) applyModuleTier(hitl.moduleIndex, hitl.pendingTier, true);
                else applyTaskTier(hitl.moduleIndex, hitl.taskIndex, hitl.pendingTier, true);
              }}
              className="px-4 py-2 text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 rounded shadow"
            >
              Confirm Override
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-xl border-t-4 max-w-sm w-full text-center" style={{ borderColor: PURPLE }}>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm"
            style={{ backgroundColor: GOLD }}
          >
            <span className="font-bold text-xl" style={{ color: PURPLE }}>UA</span>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: PURPLE }}>SUNY Albany</h1>
          <h2 className="text-sm font-semibold text-slate-500 mb-6">AI Syllabus Engine MVP</h2>

          <div className="mb-4 text-left">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Enterprise Email</label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="netid@albany.edu"
              className="w-full border border-slate-300 rounded p-3 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2"
            />
            {authError && <p className="text-xs text-red-600 font-bold mt-2">{authError}</p>}
          </div>

          <p className="text-[10px] text-slate-400 mb-4 leading-snug">
            Prototype sign-in. Entra ID single sign-on is pending ITS integration.
          </p>

          <button
            onClick={handleSimulatedLogin}
            disabled={loading}
            className="w-full text-white font-bold py-3 px-4 rounded shadow transition-all"
            style={{ backgroundColor: PURPLE }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #addendum-preview, #addendum-preview * { visibility: visible; }
          #addendum-preview { position: absolute; left: 0; top: 0; width: 100%; padding: 0; border: none; box-shadow: none; }
        }
      `}</style>

      {renderHitl()}

      <header className="text-white p-6 shadow-md border-b-4 no-print" style={{ backgroundColor: PURPLE, borderColor: GOLD }}>
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold tracking-wide">AI Syllabus Engine</h1>
          <p className="text-xs font-medium mt-1" style={{ color: GOLD }}>
            Authenticated: {session.user.email} (Dept. of {department})
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 mt-8">
        {step === 1 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold mb-4" style={{ color: PURPLE }}>Step 1: Pedagogical Context</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Course Code</label>
                <input
                  type="text"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  className="w-full border rounded p-2 text-sm text-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full border rounded p-2 text-sm text-slate-900 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="border-2 border-dashed border-slate-300 rounded p-6 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
                <label className="block text-sm font-bold text-slate-600 mb-2 cursor-pointer">
                  Upload Syllabus
                  <input
                    type="file"
                    accept=".docx,.doc,.pdf,.txt,.rtf,.md,.csv"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-500">{file ? file.name : 'Click to select a file'}</p>
                <p className="text-[10px] text-slate-400 mt-2">.docx, .pdf, .txt, .rtf, .md accepted (.docx or .pdf recommended)</p>
              </div>

              <div className="border border-slate-200 rounded p-4 bg-white">
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">AI Wish-List (Optional)</label>
                <textarea
                  rows={3}
                  value={wishList}
                  onChange={(e) => setWishList(e.target.value)}
                  placeholder="e.g., 'I want them to use ChatGPT to outline essays, but not write them...'"
                  className="w-full border rounded p-2 text-sm text-slate-900 bg-white resize-none"
                />
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading || !file}
              className="w-full font-bold py-3 px-6 rounded shadow transition-colors disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: PURPLE }}
            >
              {loading ? 'Reading syllabus and building the matrix...' : 'Run Smart Wizard →'}
            </button>
            {!file && <p className="text-xs text-slate-500 text-center mt-2">Select a syllabus file to continue.</p>}
          </div>
        )}

        {step === 2 && payload && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4 gap-4">
              <h2 className="text-xl font-bold" style={{ color: PURPLE }}>Step 2: Policy Reconciliation</h2>
              {source === 'live' ? (
                <span className="text-xs font-bold px-2 py-1 bg-green-50 text-green-800 rounded border border-green-300 whitespace-nowrap">
                  Live analysis
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-1 bg-amber-50 text-amber-900 rounded border border-amber-300 whitespace-nowrap">
                  Demonstration data
                </span>
              )}
            </div>

            {source === 'fallback' && (
              <div className="mb-4 p-3 rounded border border-amber-300 bg-amber-50 text-xs text-amber-900">
                <strong>The model call did not run.</strong> The content below is placeholder data, not an analysis of your file.
                {sourceError && <div className="mt-1 font-mono text-[10px] break-all">{sourceError}</div>}
              </div>
            )}

            <div className="mb-6 p-4 rounded border border-slate-200 bg-slate-50">
              <div className="text-sm font-bold text-slate-800">
                {payload.course.code} {payload.course.title && `— ${payload.course.title}`}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {[payload.course.department, payload.course.term, payload.course.instructor].filter(Boolean).join(' | ')}
              </div>
              <p className="text-xs text-slate-600 mt-2 italic">{payload.course_summary}</p>
              {extractedNote && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[11px] text-slate-500">{extractedNote}</span>
                  {extractedPreview && (
                    <button
                      onClick={() => setShowSource(!showSource)}
                      className="text-[11px] font-semibold underline"
                      style={{ color: PURPLE }}
                    >
                      {showSource ? 'Hide ingested text' : 'View ingested text'}
                    </button>
                  )}
                </div>
              )}
              {showSource && (
                <pre className="mt-3 max-h-56 overflow-auto text-[10px] bg-white border border-slate-200 rounded p-3 whitespace-pre-wrap text-slate-700">
                  {extractedPreview}
                </pre>
              )}
            </div>

            <p className="text-sm text-slate-600 mb-6">
              Set a tier for a whole module, or override individual tasks. Module-level changes cascade to every task inside it.
            </p>

            {modules.map((m, mi) => (
              <div key={mi} className="mb-6 border border-slate-200 rounded overflow-hidden">
                <div className="p-4 border-b border-slate-200" style={{ backgroundColor: '#f7f4fa' }}>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm" style={{ color: PURPLE }}>
                        {m.label}: {m.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{m.rationale}</div>
                    </div>
                    <div className="md:w-72">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Module-wide tier</label>
                      <select
                        value={m.current_tier}
                        onChange={(e) => initiateModuleChange(mi, e.target.value)}
                        className={`w-full p-2 border rounded text-xs font-semibold cursor-pointer ${
                          m.is_overridden ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-green-300 bg-green-50 text-green-900'
                        }`}
                      >
                        {TIERS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-3 w-1/3 text-xs uppercase">Task</th>
                      <th className="p-3 w-1/3 text-xs uppercase">Authorized Tier</th>
                      <th className="p-3 w-1/3 text-xs uppercase">Permitted Use</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {m.tasks.map((t, ti) => (
                      <tr key={ti} className="bg-white align-top">
                        <td className="p-3 font-medium text-slate-800">
                          {t.title}
                          <div className="text-[10px] text-slate-500 mt-1">{t.rationale}</div>
                        </td>
                        <td className="p-3">
                          <select
                            value={t.current_tier}
                            onChange={(e) => initiateTaskChange(mi, ti, e.target.value)}
                            className={`w-full p-2 border rounded text-xs font-semibold cursor-pointer ${
                              t.is_overridden ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-green-300 bg-green-50 text-green-900'
                            }`}
                          >
                            {TIERS.map((tier) => (
                              <option key={tier} value={tier}>{tier}</option>
                            ))}
                          </select>
                          <div className="text-[10px] mt-1">
                            {t.is_overridden ? (
                              <span className="text-amber-600 font-bold">● Faculty override logged</span>
                            ) : (
                              <span className="text-green-600 font-bold">✓ AI recommended baseline</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs text-slate-600">{t.acceptable_use}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="flex space-x-4">
              <button
                onClick={() => setStep(1)}
                className="w-1/3 bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded hover:bg-slate-300"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="w-2/3 text-white font-bold py-3 px-6 rounded shadow"
                style={{ backgroundColor: PURPLE }}
              >
                Preview Addendum →
              </button>
            </div>
          </div>
        )}

        {step === 3 && payload && (
          <div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-6 no-print">
              <h2 className="text-xl font-bold mb-2" style={{ color: PURPLE }}>Step 3: Review and Export</h2>
              <p className="text-sm text-slate-600 mb-4">
                This is the document faculty will attach to their syllabus or paste into Brightspace.
                {overrideCount > 0 && ` ${overrideCount} override(s) recorded.`}
              </p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setStep(2)} className="bg-slate-200 text-slate-700 font-bold py-2 px-5 rounded hover:bg-slate-300">
                  ← Back
                </button>
                <button onClick={downloadDoc} className="text-white font-bold py-2 px-5 rounded shadow" style={{ backgroundColor: PURPLE }}>
                  Download Word (.doc)
                </button>
                <button onClick={() => window.print()} className="font-bold py-2 px-5 rounded shadow" style={{ backgroundColor: GOLD, color: PURPLE }}>
                  Print / Save as PDF
                </button>
              </div>
            </div>

            <div
              id="addendum-preview"
              className="bg-white p-10 rounded-lg shadow-sm border border-slate-200"
              dangerouslySetInnerHTML={{ __html: buildAddendumHtml() }}
            />
          </div>
        )}
      </main>
    </div>
  );
}