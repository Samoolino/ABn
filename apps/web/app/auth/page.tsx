import { signIn } from '../../auth';

export default function Auth() {
  return (
    <main style={{minHeight:'100vh',background:'#060912',color:'#e5eefb',display:'grid',placeItems:'center',padding:24,fontFamily:'system-ui'}}>
      <section style={{width:'100%',maxWidth:980,display:'grid',gridTemplateColumns:'minmax(0,1.1fr) minmax(360px,.9fr)',border:'1px solid #1e293b',borderRadius:24,overflow:'hidden',background:'#0b1220'}}>
        <aside style={{padding:48,background:'linear-gradient(135deg,#083344,#111827)'}}>
          <div style={{fontSize:12,letterSpacing:'0.22em',color:'#22d3ee',fontWeight:700}}>ABN ENGINE</div>
          <h1 style={{fontSize:42,lineHeight:1.05,margin:'20px 0'}}>Secure access to controlled arbitrage operations.</h1>
          <p style={{color:'#94a3b8',lineHeight:1.7}}>Configure approved funding authority, exchange connectivity and server-side RPC infrastructure from an authenticated workspace. Public pages cannot arm execution or bypass engine safety gates.</p>
          <div style={{marginTop:28,color:'#cbd5e1',fontSize:14,lineHeight:2}}>
            <div>✓ Opportunity-driven sizing</div>
            <div>✓ Encrypted server-side credentials</div>
            <div>✓ Partial-fill recovery and reconciliation</div>
            <div>✓ DRY_RUN before funded LIVE</div>
          </div>
        </aside>
        <div style={{padding:48}}>
          <a href="/" style={{color:'#67e8f9',fontSize:13,textDecoration:'none'}}>← Back to landing</a>
          <h2 style={{fontSize:28,margin:'24px 0 8px'}}>Sign in</h2>
          <p style={{color:'#94a3b8',marginBottom:28}}>Use an approved identity provider to access your operations workspace.</p>

          <form action={async (formData) => { 'use server'; await signIn('credentials', { email: formData.get('email'), password: formData.get('password'), redirectTo: '/dashboard' }); }} style={{display:'grid',gap:12}}>
            <label style={{fontSize:13,color:'#cbd5e1'}}>Email</label>
            <input name="email" type="email" placeholder="you@example.com" required style={inputStyle} />
            <label style={{fontSize:13,color:'#cbd5e1'}}>Password</label>
            <input name="password" type="password" placeholder="••••••••••••" required style={inputStyle} />
            <button type="submit" style={primaryStyle}>Continue with email</button>
          </form>

          <div style={{display:'grid',gap:10,marginTop:16}}>
            <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/dashboard' }); }}><button type="submit" style={secondaryStyle}>Continue with Google</button></form>
            <form action={async () => { 'use server'; await signIn('apple', { redirectTo: '/dashboard' }); }}><button type="submit" style={secondaryStyle}>Continue with Apple</button></form>
          </div>

          <p style={{marginTop:24,fontSize:12,color:'#64748b',lineHeight:1.6}}>Authentication is handled server-side. Credentials and trading secrets are not returned to the browser after secure storage.</p>
        </div>
      </section>
    </main>
  );
}

const inputStyle = {width:'100%',boxSizing:'border-box' as const,padding:'12px 14px',borderRadius:10,border:'1px solid #334155',background:'#060912',color:'#e5eefb'};
const primaryStyle = {marginTop:8,width:'100%',padding:'12px 14px',borderRadius:10,border:0,background:'#22d3ee',color:'#06111a',fontWeight:700,cursor:'pointer'};
const secondaryStyle = {width:'100%',padding:'12px 14px',borderRadius:10,border:'1px solid #334155',background:'#111827',color:'#e5eefb',fontWeight:600,cursor:'pointer'};
