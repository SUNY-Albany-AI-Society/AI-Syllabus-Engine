'use client';

import { useState } from 'react';

type Assignment = { 
  title: string; 
  recommended_tier: string; 
  current_tier: string; 
  is_overridden: boolean 
};

export default function SyllabusWizard() {
  // 1. MOCK AUTHENTICATION STATE
  const [session, setSession] = useState<{user: {name: string, email: string}} | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [authError, setAuthError] = useState('');
  
  // 2. WIZARD & UI STATE
  const [step, setStep] = useState(1);
  const [wishList, setWishList] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState('CIST 601');
  const [department, setDepartment] = useState('Information Science');
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // 3. HITL (HUMAN-IN-THE-LOOP) STATE
  const [hitlModal, setHitlModal] = useState<{isOpen: boolean, index: number | null, pendingTier: string}>({
    isOpen: false, index: null, pendingTier: ''
  });

  const handleSimulatedLogin = () => {
    // Enforce the UAlbany domain restriction
    if (!emailInput.endsWith('@albany.edu')) {
      setAuthError('Access Denied: Please authenticate with a valid @albany.edu enterprise email.');
      return;
    }
    
    setLoading(true);
    setAuthError('');
    // Extract a mock name from the email
    const mockName = emailInput.split('@')[0].charAt(0).toUpperCase() + emailInput.split('@')[0].slice(1);
    
    setTimeout(() => {
      setSession({ user: { name: mockName, email: emailInput } });
      setLoading(false);
    }, 800);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    const formData = new FormData();
    formData.append('course', course);
    if (file) formData.append('file', file);
    if (wishList) formData.append('wishList', wishList);

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const responseData = await res.json();
      if (responseData.data?.assignments) {
        setAssignments(responseData.data.assignments);
      }
      setStep(2);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const initiateTierChange = (index: number, newTier: string) => {
    const isRecommendation = newTier === assignments[index].recommended_tier;
    
    if (!isRecommendation) {
      setHitlModal({ isOpen: true, index, pendingTier: newTier });
    } else {
      applyTierChange(index, newTier, false);
    }
  };

  const applyTierChange = (index: number, newTier: string, isOverridden: boolean) => {
    const updated = [...assignments];
    updated[index].current_tier = newTier;
    updated[index].is_overridden = isOverridden;
    setAssignments(updated);
    setHitlModal({ isOpen: false, index: null, pendingTier: '' });
  };

  const downloadPolicyAddendum = () => {
    const overrides = assignments.filter(a => a.is_overridden);
    console.log("Telemetry Log: Overrides captured for weekly Chair summary:", overrides);

    const assignmentsHtml = assignments.map(a => `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; font-weight: bold; width: 50%;">${a.title}</td>
        <td style="padding: 12px; color: #46166B; font-weight: bold; width: 50%;">${a.current_tier}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>AI Policy Addendum</title></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #46166B; border-bottom: 3px solid #EEB211; padding-bottom: 10px; display: inline-block;">Department of ${department} - AI Policy Addendum</h1>
          <p style="font-size: 14px; color: #555;">Course: <strong>${course}</strong> | Instructor: <strong>${session?.user.name}</strong></p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border: 1px solid #46166B; border-radius: 5px; margin-bottom: 30px;">
          <h2 style="color: #46166B; margin-top: 0; font-size: 18px;">I. Institutional Artificial Intelligence Policy</h2>
          <p style="font-size: 14px;">This course adheres to the SUNY Albany dynamic AI framework. Under no circumstances should Level 2 confidential data, student PII, or unpublished research be uploaded into public AI models. Students must strictly adhere to the specific module authorizations outlined below.</p>
        </div>
        
        <h2 style="color: #46166B; font-size: 18px; margin-bottom: 15px;">II. Task-Level AI Authorizations</h2>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; border: 1px solid #ddd;">
          <thead>
            <tr style="background-color: #46166B; color: white;">
              <th style="padding: 12px; border-bottom: 2px solid #EEB211;">Task / Assignment</th>
              <th style="padding: 12px; border-bottom: 2px solid #EEB211;">Authorized Usage Tier</th>
            </tr>
          </thead>
          <tbody>
            ${assignmentsHtml}
          </tbody>
        </table>
        
        <p style="margin-top: 40px; font-size: 12px; color: #777; text-align: center;">
          <em>This addendum was generated via the UAlbany AI Syllabus Engine. Attach this document to the end of your primary syllabus or copy its contents into Brightspace.</em>
        </p>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${course.replace(/\s+/g, '_')}_AI_Addendum.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderHitlModal = () => {
    if (!hitlModal.isOpen || hitlModal.index === null) return null;
    return (
      <div className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full border-t-4 border-amber-500">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Human-in-the-Loop Verification</h3>
          <p className="text-sm text-slate-600 mb-4">
            You are overriding the AI's baseline policy recommendation for <strong>{assignments[hitlModal.index].title}</strong>. 
            Please confirm this adjustment aligns with the pedagogical integrity standards of the Department of {department}.
          </p>
          <div className="flex space-x-3 justify-end">
            <button onClick={() => setHitlModal({isOpen: false, index: null, pendingTier: ''})} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
            <button onClick={() => applyTierChange(hitlModal.index as number, hitlModal.pendingTier, true)} className="px-4 py-2 text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 rounded shadow">Confirm Override</button>
          </div>
        </div>
      </div>
    );
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-lg shadow-xl border-t-4 border-[#46166B] max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-[#EEB211] rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm">
            <span className="text-[#46166B] font-bold text-xl">UA</span>
          </div>
          <h1 className="text-2xl font-bold text-[#46166B] mb-1">SUNY Albany</h1>
          <h2 className="text-sm font-semibold text-slate-500 mb-6">AI Syllabus Engine MVP</h2>
          
          <div className="mb-6 text-left">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Enterprise Email</label>
            <input 
              type="email" 
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="netid@albany.edu" 
              className="w-full border border-slate-300 rounded p-3 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-[#46166B] focus:outline-none"
            />
            {authError && <p className="text-xs text-red-600 font-bold mt-2">{authError}</p>}
          </div>

          <button onClick={handleSimulatedLogin} disabled={loading} className="w-full bg-[#46166B] hover:bg-[#341050] text-white font-bold py-3 px-4 rounded shadow transition-all flex justify-center items-center">
            {loading ? 'Authenticating...' : 'Sign In via UAlbany SSO'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {renderHitlModal()}
      
      <header className="bg-[#46166B] text-white p-6 shadow-md border-b-4 border-[#EEB211]">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">AI Syllabus Engine</h1>
            <p className="text-xs text-[#EEB211] font-medium mt-1">Authenticated: {session.user.email} (Dept. of {department})</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 mt-8">
        {step === 1 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold text-[#46166B] mb-4">Step 1: Pedagogical Context</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Course Code</label>
                <input type="text" value={course} onChange={(e) => setCourse(e.target.value)} className="w-full border rounded p-2 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-[#46166B]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Department</label>
                <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full border rounded p-2 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-[#46166B]" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="border-2 border-dashed border-slate-300 rounded p-6 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
                <label className="block text-sm font-bold text-slate-600 mb-2 cursor-pointer">
                  Upload Legacy Syllabus (.docx, .pdf)
                  <input type="file" accept=".docx,.pdf,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
                <p className="text-xs text-slate-500">{file ? file.name : "Click or drag file here"}</p>
              </div>
              
              <div className="border border-slate-200 rounded p-4 bg-white">
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">AI Wish-List (Optional)</label>
                <textarea rows={3} value={wishList} onChange={(e) => setWishList(e.target.value)} placeholder="e.g., 'I want them to use ChatGPT to outline essays, but not write them...'" className="w-full border rounded p-2 text-sm text-slate-900 bg-white resize-none focus:ring-2 focus:ring-[#46166B]" />
              </div>
            </div>
            
            <button onClick={handleAnalyze} disabled={loading} className="w-full bg-[#EEB211] text-[#46166B] font-bold py-3 px-6 rounded shadow hover:bg-[#d49f0f] transition-colors">
              {loading ? 'Synthesizing Course Matrix...' : 'Run Smart Wizard →'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[#46166B]">Step 2: Policy Reconciliation</h2>
              <span className="text-xs font-bold px-2 py-1 bg-slate-100 rounded text-slate-600 border">FERPA Compliant</span>
            </div>
            <p className="text-sm text-slate-600 mb-6">The engine has mapped your schedule and generated baseline AI authorizations. Review and override as needed.</p>
            
            <div className="overflow-hidden rounded border border-slate-200 mb-6">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#46166B] text-white">
                  <tr>
                    <th className="p-3 w-1/2 border-r border-[#341050]">Task / Module</th>
                    <th className="p-3 w-1/2">Authorized Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.map((item, index) => (
                    <tr key={index} className="bg-white hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-800 border-r">{item.title}</td>
                      <td className="p-3">
                        <select 
                          value={item.current_tier}
                          onChange={(e) => initiateTierChange(index, e.target.value)}
                          className={`w-full p-2 border rounded text-xs font-semibold focus:outline-none transition-colors cursor-pointer ${item.is_overridden ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-green-300 bg-green-50 text-green-900'}`}
                        >
                          <option value="Tier 1: Strictly Prohibited">Tier 1: Strictly Prohibited</option>
                          <option value="Tier 2: Brainstorming Permitted">Tier 2: Brainstorming Permitted</option>
                          <option value="Tier 3: Full AI Permitted">Tier 3: Full AI Permitted</option>
                          <option value="Tier 4: Permitted with Mandatory APA/Disclosure">Tier 4: Permitted with Mandatory APA/Disclosure</option>
                        </select>
                        <div className="text-[10px] mt-1 text-slate-500">
                          {item.is_overridden ? <span className="text-amber-600 font-bold">● Faculty Override Logged</span> : <span className="text-green-600 font-bold">✓ AI Recommended Baseline</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex space-x-4">
              <button onClick={() => setStep(1)} className="w-1/3 bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded hover:bg-slate-300 transition-colors">← Back</button>
              <button onClick={downloadPolicyAddendum} className="w-2/3 bg-[#46166B] text-white font-bold py-3 px-6 rounded shadow hover:bg-[#341050] transition-colors">Export Policy Addendum (.doc) →</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}