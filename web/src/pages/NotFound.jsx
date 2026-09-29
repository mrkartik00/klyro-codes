import { Button } from '../components/ui/Button.jsx';

export function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <p className="font-heading text-6xl font-700">404</p>
      <h1 className="mt-4 text-2xl font-600">Page not found</h1>
      <p className="mt-2 max-w-md text-[var(--color-muted-foreground)]">
        The page you are looking for does not exist or has moved.
      </p>
      <Button to="/" className="mt-8">
        Back home
      </Button>
    </main>
  );
}

export default NotFound;
