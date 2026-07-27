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
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow">
                <div className="flex flex-row justify-center m-4">
                    <div className="flex flex-col items-center px-2 border-2 border-gray-200 rounded-lg py-2">
                        <h1 className="text-center mb-2 font-[600]">create</h1>
                        <input type="text"
                            className="border-2 border-light rounded m-0 w-64 px-2 py-1"
                            placeholder="enter DOI or upload below"
                            value={doi}
                            disabled={loading}
                            onChange={(e) => setDoi(e.target.value)} />
                        <h3 className="text-center">or</h3>
                        <input type="file"
                            className="border-2 border-light rounded m-0 w-64 px-2 py-1 hover:bg-gray-800 hover:text-white"
                            accept="application/pdf"
                            disabled={loading}
                            onChange={(e) => setFile(e.target.files[0])} />
                        <button
                            className={`border-1 rounded w-20 mt-5 mb-4 ${loading ? 'bg-black text-white cursor-not-allowed' : 'hover:bg-gray-400'}`}
                            type="submit"
                            disabled={loading}
                            onClick={() => handleCreate()}>
                            DONE
                        </button>

                        <div className={`flex-grow flex items-center justify-center pt-[5%] ${loading ? 'animate-pulse' : 'hidden'}`}>
                            <h1 className="text-center text-[150%] font-semibold">+ {text} +</h1>
                        </div>
                    </div>
                </div>
                <br />
                <hr className="border-gray-300 mx-[10%]" />

                {/* Active Sessions */}
                <div className="flex flex-col justify-center items-center mt-6 mx-[10%]">
                    <h2 className="text-lg font-semibold mb-2 underline">Sessions</h2>
                    {activeSessions.length === 0 ? (
                        <p>No active sessions.</p>
                    ) : (
                        <ul className="flex flex-col flex-wrap sm:flex-row gap-2">
                            {activeSessions.map((session) => {
                                const minutes = Math.floor(session.ttl_seconds / 60);
                                const seconds = session.ttl_seconds % 60;

                                return (
                                    <li
                                        key={session.session_id}
                                        className={`border p-2 w-50 rounded cursor-pointer ${loading ? "opacity-50 pointer-events-none" : "hover:bg-gray-200"}`}
                                        disabled={loading}
                                        onClick={() =>
                                            navigate(`/chat/${session.session_id}`, {
                                                state: {
                                                    session_id: session.session_id,
                                                },
                                            })
                                        }
                                    >
                                        <p><b>Session ID:</b> {session.session_id}</p>
                                        <p><b>Active for:</b> {minutes}m {seconds}s</p>
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