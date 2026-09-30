import { Link, Route, Routes } from "react-router-dom";
import { IdeaListPage } from "@/pages/IdeaListPage";
import { IdeaDetailPage } from "@/pages/IdeaDetailPage";

function App() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-card px-4 py-3.5">
        <Link to="/" className="text-[1.05rem] font-bold">
          App Idea Factory
        </Link>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 pb-16">
        <Routes>
          <Route path="/" element={<IdeaListPage />} />
          <Route path="/ideas/:id" element={<IdeaDetailPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
