import { Routes, Route } from 'react-router-dom';
import { Home } from '../pages/Home.jsx';
import { Work } from '../pages/Work.jsx';
import { CaseStudy } from '../pages/CaseStudy.jsx';
import { StartProject } from '../pages/StartProject.jsx';
import { Pitch } from '../pages/Pitch.jsx';
import { Privacy } from '../pages/Privacy.jsx';
import { Terms } from '../pages/Terms.jsx';
import { Unsubscribe } from '../pages/Unsubscribe.jsx';
import { NotFound } from '../pages/NotFound.jsx';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/work" element={<Work />} />
      <Route path="/work/:slug" element={<CaseStudy />} />
      <Route path="/start" element={<StartProject />} />
      <Route path="/pitch/:slug" element={<Pitch />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/unsubscribe" element={<Unsubscribe />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
