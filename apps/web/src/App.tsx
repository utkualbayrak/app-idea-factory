import { Link, Route, Routes } from "react-router-dom";
import { IdeaListPage } from "./pages/IdeaListPage";
import { IdeaDetailPage } from "./pages/IdeaDetailPage";
import "./App.css";

function App() {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-header__title">
          App Idea Factory
        </Link>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<IdeaListPage />} />
          <Route path="/ideas/:id" element={<IdeaDetailPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
