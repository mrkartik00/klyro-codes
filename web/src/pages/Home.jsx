import { Hero } from '../components/sections/Hero.jsx';
import { Marquee } from '../components/sections/Marquee.jsx';
import { Services } from '../components/sections/Services.jsx';
import { WorkShowcase } from '../components/sections/WorkShowcase.jsx';
import { Process } from '../components/sections/Process.jsx';
import { WhyKlyro } from '../components/sections/WhyKlyro.jsx';
import { CtaBand } from '../components/sections/CtaBand.jsx';
import { Contact } from '../components/sections/Contact.jsx';

export function Home() {
  return (
    <main>
      <Hero />
      <Marquee />
      <Services />
      <WorkShowcase heading="Products we’ve shipped." />
      <Process />
      <WhyKlyro />
      <CtaBand />
      <Contact />
    </main>
  );
}

export default Home;
