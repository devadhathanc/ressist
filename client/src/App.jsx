import { BrowserRouter, Routes, Route} from "react-router";
import Home from "./home.jsx";
import About from "./about.jsx";
import Chat from "./chat.jsx";

function App() {
  return (
    <>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/chat" element={<Chat />} />
      </Routes>
    </BrowserRouter>
    </>
  );
}

export default App;