import Link from 'next/link';

export default function Signup() {
  return <main style={{padding:32,maxWidth:480}}>
    <h1>Create account</h1>
    <p>Accounts are stored in PostgreSQL. Passwords are bcrypt-hashed server-side.</p>
    <form action="/api/auth/signup" method="post">
      <input name="email" type="email" placeholder="Email" required style={{display:'block',marginBottom:8,width:'100%'}} />
      <input name="password" type="password" minLength={12} placeholder="Password (12+ characters)" required style={{display:'block',marginBottom:8,width:'100%'}} />
      <button type="submit">Create account</button>
    </form>
    <p><Link href="/auth">Back to sign in</Link></p>
  </main>;
}
