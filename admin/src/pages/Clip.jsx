import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ExternalLink, Copy, Bookmark, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardContent, Button, Input, Label, Textarea, Badge, Spinner } from '../components/ui/index.jsx';

// Platforms that can't be automated safely: open a ready-made search, then clip
// the posts worth pursuing. Phrases are what buyers actually write.
const PHRASES = ['"looking for a developer"', '"need a website"', '"need an app built"', '"looking for a web designer"', '"recommend a developer"', '"hire an app developer"'];
const q = (s) => encodeURIComponent(s);
const SEARCHES = [
  { platform: 'X (Twitter)', note: 'Latest posts, no replies/retweets', url: (p) => `https://x.com/search?q=${q(`${p} -is:retweet -is:reply lang:en`)}&f=live` },
  { platform: 'LinkedIn', note: 'Posts, newest first', url: (p) => `https://www.linkedin.com/search/results/content/?keywords=${q(p)}&sortBy=%22date_posted%22` },
  { platform: 'Facebook', note: 'Public posts (groups: search inside each group)', url: (p) => `https://www.facebook.com/search/posts?q=${q(p.replace(/"/g, ''))}` },
  { platform: 'Threads', note: 'Recent', url: (p) => `https://www.threads.net/search?q=${q(p.replace(/"/g, ''))}&filter=recent` },
  { platform: 'Instagram', note: 'Hashtag pages', url: () => 'https://www.instagram.com/explore/tags/needawebsite/' },
  { platform: 'Quora', note: 'Questions', url: (p) => `https://www.quora.com/search?q=${q(p.replace(/"/g, ''))}&type=question` },
  { platform: 'Nextdoor', note: 'Local recommendations (log in)', url: () => 'https://nextdoor.com/search/posts/?query=web%20designer' },
  { platform: 'Google (all sites)', note: 'Past week', url: (p) => `https://www.google.com/search?q=${q(p)}&tbs=qdr:w` },
];

export function bookmarklet(origin) {
  // Runs on the page you are viewing: sends URL + title + selected text to the
  // Clip page (which saves it with your admin login). No data leaves otherwise.
  const js = `(()=>{const s=String(window.getSelection()||'').slice(0,6000);const t=document.title.slice(0,300);window.open('${origin}/clip?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(t)+'&text='+encodeURIComponent(s),'klyroclip','width=560,height=720');})()`;
  return `javascript:${encodeURIComponent(js)}`;
}

export default function Clip() {
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const [url, setUrl] = useState(params.get('url') || '');
  const [title, setTitle] = useState(params.get('title') || '');
  const [text, setText] = useState(params.get('text') || '');
  const [author, setAuthor] = useState('');
  const [phrase, setPhrase] = useState(PHRASES[0]);
  const [result, setResult] = useState(null);
  const origin = window.location.origin;
  const mark = useMemo(() => bookmarklet(origin), [origin]);

  const sources = useQuery({ queryKey: ['clip-sources'], queryFn: () => unwrap(api.get('/admin/clip/sources')) });
  const save = useMutation({
    mutationFn: () => unwrap(api.post('/admin/clip', { url: url.trim(), title, text, ...(author.trim() ? { author: author.trim() } : {}) })),
    onSuccess: (d) => {
      setResult(d);
      toast.success(d.created ? 'Saved as a lead' : 'Already saved — opening the lead');
    },
    onError: (e) => toast.error(e.message || 'Could not save'),
  });
  const copy = async (s) => {
    try {
      await navigator.clipboard.writeText(s);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Clip & search" description="Find buyers on X, LinkedIn, Facebook, Threads and more — open a ready search, then clip the good posts. Klyro's AI qualifies them and drafts your reply." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Bookmark size={16} aria-hidden="true" /> Save a post as a lead
            </h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim()) save.mutate();
              }}
            >
              <div>
                <Label htmlFor="c-url">Post link *</Label>
                <Input id="c-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://x.com/…/status/…" />
              </div>
              <div>
                <Label htmlFor="c-title">Title (optional)</Label>
                <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="c-text">Post text — paste it so the AI can read it</Label>
                <Textarea id="c-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the post (LinkedIn/X/Facebook pages can't be read by the server)." />
              </div>
              <div>
                <Label htmlFor="c-author">Author name / handle (optional)</Label>
                <Input id="c-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="found from the link when possible" />
              </div>
              <Button type="submit" disabled={!url.trim() || save.isPending}>
                {save.isPending ? 'Checking with AI…' : 'Save lead'}
              </Button>
            </form>
            {result && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm" aria-live="polite">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={result.role === 'buyer' ? 'success' : 'warning'}>{result.ai ? `AI: ${result.role}` : 'AI unavailable'}</Badge>
                  {result.ai && <span>intent {Math.round((result.intent || 0) * 100)}%</span>}
                  <Link to={`/leads/${result.leadId}`} className="ml-auto text-primary hover:underline">
                    Open lead
                  </Link>
                </p>
                {result.need && <p className="text-muted-foreground">{result.need}</p>}
                {result.reply && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Suggested reply (also in Approvals)</p>
                    <p className="whitespace-pre-wrap rounded border border-border p-2">{result.reply}</p>
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => copy(result.reply)}>
                      <Copy size={14} aria-hidden="true" /> Copy reply
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-lg border border-dashed border-border p-3 text-sm">
              <p className="mb-2 font-medium">One-click clipper (desktop)</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Drag this button to your bookmarks bar. On any post, select its text and click the bookmark — this page opens pre-filled.
              </p>
              {/* A bookmarklet must be a javascript: link; it only runs when you click it. */}
              <a href={mark} onClick={(e) => e.preventDefault()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" draggable="true">
                <Bookmark size={14} aria-hidden="true" /> Save to Klyro
              </a>
              <p className="mt-2 text-xs text-muted-foreground">On mobile: use Share → copy link, then paste it above.</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Search size={16} aria-hidden="true" /> Ready-made searches
              </h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Phrase">
                {PHRASES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={phrase === p}
                    onClick={() => setPhrase(p)}
                    className={`min-h-9 rounded-full border px-3 text-xs ${phrase === p ? 'border-primary bg-primary/15' : 'border-border hover:bg-muted'}`}
                  >
                    {p.replace(/"/g, '')}
                  </button>
                ))}
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {SEARCHES.map((s) => (
                  <li key={s.platform}>
                    <a href={s.url(phrase)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 px-3 py-2 hover:bg-muted/50">
                      <span className="flex-1">
                        <span className="font-medium">{s.platform}</span>
                        <span className="block text-xs text-muted-foreground">{s.note}</span>
                      </span>
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Reply from your own account and keep it helpful — these platforms ban automated or spammy outreach.</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="text-base font-semibold">Automatic sources</h2>
              {sources.isLoading ? (
                <Spinner />
              ) : (
                <ul className="space-y-2 text-sm">
                  {(sources.data?.sources || []).map((s) => (
                    <li key={s.id} className="flex items-start gap-2">
                      {s.ready ? <CheckCircle2 size={16} className="mt-0.5 text-emerald-400" aria-hidden="true" /> : <AlertCircle size={16} className="mt-0.5 text-amber-400" aria-hidden="true" />}
                      <span>
                        <span className="font-medium">{s.label}</span> — {s.ready ? 'ready' : `add ${s.missing.join(', ')} to the server .env`}
                        <span className="block text-xs text-muted-foreground">{s.hint}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {sources.data?.usage && (
                <p className="text-xs text-muted-foreground">
                  This month: X reads {sources.data.usage.x.used}/{sources.data.usage.x.cap} · Brave searches {sources.data.usage.brave.used}/{sources.data.usage.brave.cap}
                </p>
              )}
              <Link to="/targets" className="text-sm text-primary hover:underline">
                Manage searches in Lead Sources →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
