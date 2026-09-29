import { Link } from 'react-router-dom';
import { Button } from '../components/ui/index.jsx';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="font-heading text-5xl font-semibold">404</p>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          We couldn't find that page.
        </p>
        <div className="mt-6">
          <Link to="/">
            <Button>Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
