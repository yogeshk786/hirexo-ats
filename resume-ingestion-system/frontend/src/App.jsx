import { useState } from 'react'

function App() {
  // --- 1. React Memory (State) ---
  const [resumes, setResumes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // --- 2. The Bridge to Python ---
  const fetchResumes = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('http://127.0.0.1:8000/api/search')
      if (!response.ok) throw new Error('Could not connect to the Python backend!')
      
      const jsonData = await response.json()
      // Safely ensure we always set an array
      setResumes(Array.isArray(jsonData.results) ? jsonData.results : []) 
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- 3. What the User Sees (UI) ---
  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', maxWidth: '1100px', margin: '0 auto', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#111827', margin: 0 }}>Resume Ingestion Engine 🚀</h1>
        
        {/* 🔥 THE BREAK TEST IS RIGHT HERE 🔥 */}
        <h1 style={{ color: 'red', fontSize: '50px', border: '5px solid red' }}>🚨 BREAK TEST 🚨</h1>
        
        <button 
          onClick={fetchResumes} 
          disabled={loading}
          style={{ 
            padding: '12px 24px', 
            fontSize: '16px', 
            backgroundColor: loading ? '#9ca3af' : '#2563eb', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px',
            cursor: loading ? 'wait' : 'pointer',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            transition: 'background-color 0.2s'
          }}
        >
          {loading ? 'Loading Database...' : 'View Candidates'}
        </button>
      </div>

      {error && <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '16px', borderRadius: '8px', marginBottom: '20px', fontWeight: '500' }}>⚠️ Error: {error}</div>}

      {/* --- THE ATS DATA CARDS --- */}
      {resumes.length > 0 && (
        <div style={{ display: 'grid', gap: '24px' }}>
          
          {resumes.map((resume, index) => (
            <div key={index} style={{ backgroundColor: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
              
              {/* Header: Name and Experience Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e5e7eb', paddingBottom: '20px', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ margin: '0 0 8px 0', color: '#111827', fontSize: '28px', fontWeight: '800' }}>
                    {resume.name || 'Unknown Candidate'}
                  </h2>
                  <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
                    📄 {resume.filename || 'Direct Input'} | 📍 {resume.location || 'Location Not Provided'}
                  </div>
                </div>
                
                {/* Years Experience Badge */}
                <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '10px 20px', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                  <div style={{ fontSize: '24px', lineHeight: '1' }}>{resume.total_years_experience || 0}</div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.05em' }}>Years Exp</div>
                </div>
              </div>
              
              {/* Contact Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '14px', color: '#334155' }}>
                  <strong style={{ color: '#0f172a' }}>✉️ Email:</strong> {resume.email || 'Not Found'}
                </div>
                <div style={{ fontSize: '14px', color: '#334155' }}>
                  <strong style={{ color: '#0f172a' }}>📱 Phone:</strong> {resume.phone || 'Not Found'}
                </div>
              </div>

              {/* Summary */}
              {resume.summary && (
                <div style={{ marginBottom: '24px' }}>
                  <p style={{ fontSize: '15px', color: '#475569', lineHeight: '1.7', margin: 0 }}>
                    {resume.summary}
                  </p>
                </div>
              )}

              {/* Badges Section (Tech Skills, Soft Skills, Languages) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                
                {/* Technical Skills */}
                <div>
                  <strong style={{ fontSize: '14px', color: '#1e293b', display: 'block', marginBottom: '12px' }}>💻 Technical Skills:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Array.isArray(resume.technical_skills) && resume.technical_skills.length > 0 ? (
                      resume.technical_skills.map((skill, sIndex) => (
                        <span key={`tech-${sIndex}`} style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '6px 12px', borderRadius: '9999px', fontSize: '13px', fontWeight: '500', border: '1px solid #bfdbfe' }}>
                          {skill}
                        </span>
                      ))
                    ) : <span style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>None listed</span>}
                  </div>
                </div>

                {/* Soft Skills & Languages */}
                <div>
                  <strong style={{ fontSize: '14px', color: '#1e293b', display: 'block', marginBottom: '12px' }}>🤝 Soft Skills:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    {Array.isArray(resume.soft_skills) && resume.soft_skills.length > 0 ? (
                      resume.soft_skills.map((skill, sIndex) => (
                        <span key={`soft-${sIndex}`} style={{ backgroundColor: '#fdf4ff', color: '#a21caf', padding: '4px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500', border: '1px solid #fbcfe8' }}>
                          {skill}
                        </span>
                      ))
                    ) : <span style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>None listed</span>}
                  </div>

                  <strong style={{ fontSize: '14px', color: '#1e293b', display: 'block', marginBottom: '12px' }}>🌍 Languages:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Array.isArray(resume.languages) && resume.languages.length > 0 ? (
                      resume.languages.map((lang, lIndex) => (
                        <span key={`lang-${lIndex}`} style={{ backgroundColor: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', border: '1px solid #cbd5e1' }}>
                          {lang}
                        </span>
                      ))
                    ) : <span style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>None listed</span>}
                  </div>
                </div>
              </div>

              {/* 💼 WORK EXPERIENCE SECTION */}
              <div style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                <strong style={{ fontSize: '14px', color: '#1e293b', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💼 Work Experience</strong>
                {Array.isArray(resume.work_experience) && resume.work_experience.length > 0 ? (
                  <div style={{ display: 'grid', gap: '16px' }}>
                    {resume.work_experience.map((job, jIndex) => (
                      <div key={`job-${jIndex}`} style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px' }}>{job.job_title || 'Role Not Specified'}</div>
                          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '600', backgroundColor: 'white', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                            {job.duration || job.date || 'Dates Unknown'}
                          </div>
                        </div>
                        <div style={{ color: '#3b82f6', fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>{job.company || 'Company Unknown'}</div>
                        {job.description && <div style={{ color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>{job.description}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', color: '#94a3b8', fontStyle: 'italic' }}>No work experience listed.</div>
                )}
              </div>

              {/* Education, Certifications, and Projects Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                
                {/* Education */}
                <div>
                  <strong style={{ fontSize: '14px', color: '#1e293b', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎓 Education</strong>
                  {Array.isArray(resume.education) && resume.education.length > 0 ? (
                    resume.education.map((edu, eIndex) => (
                      <div key={`edu-${eIndex}`} style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '14px', lineHeight: '1.3' }}>{edu.degree || 'Degree Unknown'}</div>
                        <div style={{ color: '#475569', fontSize: '13px', marginTop: '4px' }}>{edu.institution || 'Institution Unknown'}</div>
                        {edu.year && <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', fontWeight: '500' }}>{edu.year}</div>}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>No education listed.</div>
                  )}
                </div>

                {/* Certifications */}
                <div>
                  <strong style={{ fontSize: '14px', color: '#1e293b', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏆 Certifications</strong>
                  {Array.isArray(resume.certifications) && resume.certifications.length > 0 ? (
                    resume.certifications.map((cert, cIndex) => (
                      <div key={`cert-${cIndex}`} style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '14px', lineHeight: '1.3' }}>{cert.name || 'Certification Name Missing'}</div>
                        {cert.issuer && <div style={{ color: '#475569', fontSize: '13px', marginTop: '4px' }}>{cert.issuer}</div>}
                        {cert.date && <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', fontWeight: '500' }}>{cert.date}</div>}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>No certifications listed.</div>
                  )}
                </div>

                {/* Projects */}
                <div>
                  <strong style={{ fontSize: '14px', color: '#1e293b', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🚀 Projects</strong>
                  {Array.isArray(resume.projects) && resume.projects.length > 0 ? (
                    <ul style={{ paddingLeft: '16px', margin: 0, color: '#475569', fontSize: '13px' }}>
                      {resume.projects.map((project, pIndex) => (
                        <li key={`proj-${pIndex}`} style={{ marginBottom: '10px', lineHeight: '1.5' }}>{project}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>No projects listed.</div>
                  )}
                </div>

              </div>

            </div>
          ))}

        </div>
      )}
      
      {/* EMPTY STATE */}
      {resumes.length === 0 && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#6b7280', border: '2px dashed #cbd5e1', borderRadius: '12px', backgroundColor: 'white' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
          <p style={{ fontSize: '20px', margin: '0 0 8px 0', fontWeight: '600', color: '#0f172a' }}>No candidates loaded yet.</p>
          <p style={{ fontSize: '15px', margin: 0, color: '#475569' }}>Click the "View Candidates" button above to fetch data from the MongoDB engine.</p>
        </div>
      )}

    </div>
  )
}

export default App