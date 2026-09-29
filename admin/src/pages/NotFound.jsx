import { Link } from 'react-router-dom';
import { Button } from '../components/ui/index.jsx';

export default function NotFound() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background p-4 text-center">
      <div>
        <p className="font-heading text-6xl font-bold text-muted-foreground">404</p>
        <p className="mt-2 text-lg">Page not found</p>
        <Button as={Link} to="/" className="mt-6">
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
