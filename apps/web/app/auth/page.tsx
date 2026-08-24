import { signIn } from '../../auth';

export default function Auth({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  return <main style={{padding:32,maxWidth:480}}>
    <h1>Sign in</h1>
    <p>PostgreSQL-backed authentication. Supabase is not used.</p>
    <form action={async (formData) => { 'use server'; await signIn('credentials', { email: formData.get('email'), password: formData.get('password'), redirectTo: '/dashboard' }); }}>
      <input name="email" type="email" placeholder="Email" required style={{display:'block',marginBottom:8,width:'100%'}} />
      <input name="password" type="password" placeholder="Password" required style={{display:'block',marginBottom:8,width:'100%'}} />
      <button type="submit">Email / Password</button>
    </form>
    <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/dashboard' }); }}><button type="submit">Continue with Google</button></form>
    <form action={async () => { 'use server'; await signIn('apple', { redirectTo: '/dashboard' }); }}><button type="submit">Continue with Apple</button></form>
    <p>{searchParams ? 'Authentication is controlled by the server.' : ''}</p>
  </main>;
}
