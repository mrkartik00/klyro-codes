import { WorkShowcase } from '../components/sections/WorkShowcase.jsx';
import { CtaBand } from '../components/sections/CtaBand.jsx';

export function Work() {
  return (
    <main className="pt-24">
      <WorkShowcase heading="Every product, live in production." showAllLink={false} />
      <CtaBand />
    </main>
  );
}

export default Work;
