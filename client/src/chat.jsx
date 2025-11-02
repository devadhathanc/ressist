import React, { useState } from "react";
import { useLocation } from "react-router";

function Chat() {
  const location = useLocation();
  const { session_id, creation_date, title } = location.state || {};

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    // Show user message immediately
    const newMessages = [...messages, { sender: "user", text: input }];
    setMessages(newMessages);
    setInput("");

    try {
      const res = await fetch("http://localhost:8080/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id, question: input }),
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
        ...newMessages,
        { sender: "bot", text: data && data.answer ? data.answer : "No response from backend." },
      ]);
    } catch (err) {
      console.error(err);
      setMessages([
        ...newMessages,
        { sender: "bot", text: "⚠️ Failed to reach backend." },
      ]);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="text-center py-5 border-b">
        <h1 className="text-3xl font-mono">{title || "Session Chat"}</h1>
        <div className="flex justify-between mx-5 text-sm text-gray-600">
          <span>Session ID: {session_id}</span>
          <span>Created: {creation_date}</span>
        </div>
      </header>

      {/* Chat messages area */}
      <main className="flex-grow flex flex-col items-center p-4 overflow-y-auto">
        <div className="w-full max-w-2xl h-[70vh] overflow-y-auto border rounded-lg bg-white shadow p-4">
          {messages.length === 0 ? (
            <p className="text-gray-400 text-center mt-10">
              Ask something about the paper to get started!
            </p>
          ) : (
            <div className="flex flex-col">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`my-2 p-2 rounded-lg inline-block max-w-[80%] break-words ${
                    msg.sender === "user"
                      ? "ml-auto bg-blue-600 text-white"
                      : "mr-auto bg-gray-200 text-black"
                  }`}
                >
                  {msg.text}
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
            placeholder="Ask about the paper..."
            className="flex-grow border-2 border-gray-300 rounded-l-lg p-2 focus:outline-none"
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 rounded-r-lg hover:bg-blue-700"
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
}

export default Chat;