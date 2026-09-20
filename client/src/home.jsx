import { useNavigate } from "react-router-dom";
import React, { useEffect } from "react";
import Footer from "./footer.jsx"
import Header from "./header.jsx"
import { API_BASE } from "./config.js"

import Example from "./example.jsx"

function Home() {
    const navigate = useNavigate();
    const [text, setText] = React.useState("Assistant Here");
    const [doi, setDoi] = React.useState("10.1371/journal.pone.0216777");
    const [file, setFile] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [activeSessions, setActiveSessions] = React.useState([]);

    // Fetch all active sessions on page load
    useEffect(() => {
        async function fetchActiveSessions() {
            try {
                const res = await fetch(`${API_BASE}/api/active-sessions`);
                const data = await res.json();
                setActiveSessions(data.sessions || []);
            } catch (err) {
                console.error("Failed to fetch active sessions:", err);
            }
        }
        fetchActiveSessions();
    }, []);

    // Decrease TTL every second for each active session
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveSessions(prevSessions =>
                prevSessions
                    .map(session => {
                        const newTtl = session.ttl_seconds > 0 ? session.ttl_seconds - 1 : 0;
                        return { ...session, ttl_seconds: newTtl };
                    })
                    .filter(session => session.ttl_seconds > 0)
            );
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    async function handleCreate() {
        if (loading) return;
        setLoading(true);
        setText("Loading");
        try {
            const formData = new FormData();
            if (doi && doi.trim() !== "") {
                formData.append("doi", doi.trim());
            } else if (file) {
                formData.append("pdf", file);
            }
            console.log("Submitting form data:", formData);
            const res = await fetch(`${API_BASE}/api/create-session`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (data.error === "max sessions reached") {
                alert("Max sessions reached. Please try again later.");
                return;
            }
            console.log("Session created:", data);
            navigate(`/chat/${data.session_id}`, {
                state: {
                    session_id: data.session_id,
                }
            }
            )
        } finally {
            setLoading(false);
            setText("Assistant Here");
        }
    }

    return (
        <div className="flex flex-col min-h-screen bg-white text-black">
            <Header />
            <main className="flex-grow">
                <div className="flex flex-row justify-center m-4">
                    <div className="flex flex-col items-center px-6 py-4 border border-black rounded-none">
                        <h1 className="text-center mb-3 text-xs font-mono uppercase tracking-[0.3em]">new session</h1>
                        <input type="text"
                            className="border border-black rounded-none m-0 w-64 px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-black placeholder:text-gray-400"
                            placeholder="enter DOI"
                            value={doi}
                            disabled={loading}
                            onChange={(e) => setDoi(e.target.value)} />
                        <span className="text-xs font-mono text-gray-400 my-2">or</span>
                        <input type="file"
                            className="border border-black rounded-none m-0 w-64 px-3 py-2 text-sm font-mono cursor-pointer file:border-0 file:bg-black file:text-white file:px-3 file:py-1 file:mr-3 file:text-xs file:font-mono file:cursor-pointer"
                            accept="application/pdf"
                            disabled={loading}
                            onChange={(e) => setFile(e.target.files[0])} />
                        <button
                            className={`border border-black rounded-none px-6 py-2 mt-5 mb-2 text-xs font-mono uppercase tracking-widest transition-colors ${loading ? 'bg-black text-white cursor-not-allowed' : 'hover:bg-black hover:text-white'}`}
                            type="submit"
                            disabled={loading}
                            onClick={() => handleCreate()}>
                            {loading ? '...' : 'GO'}
                        </button>

                        <div className={`flex-grow flex items-center justify-center pt-[5%] ${loading ? 'animate-pulse' : 'hidden'}`}>
                            <h1 className="text-center text-sm font-mono tracking-widest uppercase">{text}</h1>
                        </div>
                    </div>
                </div>

                <div className="mx-[10%] my-6 border-t border-gray-200" />

                {/* Active Sessions */}
                <div className="flex flex-col justify-center items-center mt-6 mx-[10%]">
                    <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-4">active sessions</h2>
                    {activeSessions.length === 0 ? (
                        <p className="text-sm font-mono text-gray-400">No active sessions.</p>
                    ) : (
                        <ul className="flex flex-col flex-wrap sm:flex-row gap-3">
                            {activeSessions.map((session) => {
                                const minutes = Math.floor(session.ttl_seconds / 60);
                                const seconds = session.ttl_seconds % 60;

                                return (
                                    <li
                                        key={session.session_id}
                                        className={`border border-black p-3 w-52 cursor-pointer font-mono transition-colors ${loading ? "opacity-50 pointer-events-none" : "hover:bg-black hover:text-white"}`}
                                        disabled={loading}
                                        onClick={() =>
                                            navigate(`/chat/${session.session_id}`, {
                                                state: {
                                                    session_id: session.session_id,
                                                },
                                            })
                                        }
                                    >
                                        <p className="text-xs"><span className="opacity-50">id:</span> {session.session_id}</p>
                                        <p className="text-xs mt-1"><span className="opacity-50">ttl:</span> {minutes}m {seconds}s</p>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>



            </main>
            {/* <Example /> */}



            <Footer />
        </div>

    )
}

export default Home