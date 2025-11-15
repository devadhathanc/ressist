import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session_id } = useParams();
  const [title, setTitle] = useState(location.state?.title || "PDF Uploaded");
  const [journal, setJournal] = useState(location.state?.journal || "General");

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (!session_id) return;

    fetch(`http://localhost:8080/api/chat-history?session_id=${session_id}`)
      .then((res) => res.json())
      .then((data) => {
        const mappedMessages = (data.messages || []).map((msg) => ({
          question: msg.question || "",
          response: msg.response || "",
        }));

        if (data.title) setTitle(data.title);
        if (data.journal) setJournal(data.journal);

        setMessages(mappedMessages);
      })
      .catch((err) => console.error("Failed to fetch chat history:", err));
  }, [session_id]);

  useEffect(() => {
    if (!chatContainerRef.current) return;
    const container = chatContainerRef.current;
    const threshold = 150; // px

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;

    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    // Show user message immediately
    const newMessages = [...messages, { question: input, response: "" }];
    setMessages(newMessages);
    setInput("");

    try {
      const res = await fetch("http://localhost:8080/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session_id || "",
          question: input,
        }),
      });

      let data;
      try {
        if (res.status === 204) {
          data = {};
        } else {
          data = await res.json();
        }
      } catch {
        data = null;
      }

      setMessages([
        ...newMessages.slice(0, -1),
        {
          question: newMessages[newMessages.length - 1].question,
          response: data && data.answer ? data.answer : "No response from backend.",
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages([
        ...newMessages.slice(0, -1),
        {
          question: newMessages[newMessages.length - 1].question,
          response: "⚠️ Failed to reach backend.",
        },
      ]);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="flex items-center justify-between p-3 border-b w-full">
        <button
          className="border solid rounded py-1 px-3 font-mono text-blue-500 hover:bg-blue-400 hover:text-white"
          onClick={() => navigate("/")}
        >
          back
        </button>

        <h1 className="text-3xl font-mono text-center">
          <span className="hidden sm:inline">Session/{session_id}</span>
          <span className="inline sm:hidden">{session_id}</span>
        </h1>
        <img src="/cap1.png" className="h-[36px]" />
      </header>

      {/* Chat messages area */}
      <div className="flex flex-row">
      <main className="flex-grow flex flex-col p-4 items-center lg:items-start overflow-y-auto">
        <div ref={chatContainerRef} className="w-full max-w-3xl h-[80vh] overflow-y-auto border rounded-lg bg-white shadow p-4">
          {messages.length === 0 ? (
            <p className="text-gray-400 text-center mt-10">
              Ask something about the paper to get started!
            </p>
          ) : (
            <div className="flex flex-col">
              {messages.map((msg, i) => (
                <div key={i} className="mb-4 flex flex-col">
                  {/* User question */}
                  <div className="flex justify-end text-xs font-semibold text-gray-500">
                      User
                  </div>
                  <div className="ml-auto bg-blue-600 text-white px-3 py-2 rounded-lg break-words max-w-[70%]">
                    <div className="text-left">
                      {msg.question}
                    </div>
                  </div>
                  {/* Bot response */}
                  <div className="text-xs font-semibold text-gray-500">
                      Response
                  </div>
                  <div className="mr-auto border solid border-gray-300 text-black p-2 rounded-lg max-w-[95%] mt-1 block">
                    <div className="prose break-words overflow-x-auto">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          ol: ({node, ...props}) => <ol className="list-decimal ml-6" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc ml-6" {...props} />,
                          li: ({node, ...props}) => <li className="mb-1" {...props} />,
                        }}
                      >
                        {msg.response || "fetching results ..."}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input box */}
        <div className="w-full max-w-2xl flex mt-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
            placeholder="Ask about the paper..."
            className="flex-grow border-2 border-gray-300 rounded-3xl p-2 px-5 focus:outline-none mr-2"
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 rounded-3xl hover:bg-blue-700"
          >
            Send
          </button>
        </div>
      </main>

      <div className="hidden lg:flex flex-col flex-wrap justify-center items-end w-[30%] mx-4">
        <h2 className="text-lg italic text-gray-500">&lt;{journal}&gt;</h2>
        <h1 className="text-5xl font-bold text-wrap text-right text-black">{title}</h1>
      </div>
      </div>
      
    </div>
  );
}

export default Chat;