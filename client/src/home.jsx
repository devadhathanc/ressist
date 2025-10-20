import { useNavigate } from "react-router-dom";
import React from "react";
import Footer from "./footer.jsx"
import Header from "./header.jsx"

import Example from "./example.jsx"

function Home() {
    const navigate = useNavigate();
    const [key, setKey] = React.useState("");

    const[doi, setDoi] = React.useState("10.1038/s41598-025-19951-2");
    const [file, setFile] = React.useState(null);
    const [loading, setLoading] = React.useState(false);


    async function handleSubmit(){
        if (!key) return alert("Please enter a session key");

        try {
            const res = await fetch("http://localhost:8080/api/join-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: key })
            });

            const data = await res.json();

            if (res.status === 404 || data.error) {
                alert(`Session ${key} not found`);
                return;
            }

            // Navigate to chat with session metadata
            navigate("/chat", {
                state: {
                    title: "Session Chat",
                    session_id: data.session_id,
                    creation_date: data.creation_date
                }
            });
        } catch (err) {
            console.error(err);
            alert("Failed to join session. Try again.");
        }
    }
    async function handleCreate() {
        if (loading) return;
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('doi', doi);
            formData.append('file', file);
            const res = await fetch("http://localhost:8080/api/create-session", {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error === "max sessions reached") {
                alert("Max sessions reached. Please try again later.");
                return;
            }
            navigate("/chat" , {state:{title : "Session Chat", session_id :data.session_id, creation_date : data.creation_date}});
        } finally {
            setLoading(false);
        }
    }
    
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow">
            <div className="flex sm:flex-row flex-col justify-center m-4 gap-8">
                <div className="flex flex-col items-center px-2 border-2 border-black">
                <h1 className="text-center mb-2 underline font-[600]"> session-key</h1>
                <input type="number" className="border-2 border-light px-2" value={key} onChange={(e) => setKey(e.target.value)} placeholder="enter the key"/>
                <p>{key}</p>
                <button className="border-1 w-20 m-4 hover:bg-gray-400" type="submit" onClick={() => handleSubmit()}>SUBMIT</button>
            </div>
            <div className="flex flex-col items-center px-2 border-2 border-dashed ">
                <h1 className="text-center mb-2 underline font-[600]">create</h1>
                <input type="text"
                    className="border-2 border-light m-0 w-64 px-2 py-1" 
                    placeholder="enter DOI or upload below"
                    value={doi}
                    onChange={(e) => setDoi(e.target.value)}/>
                <h3 className="text-center">or</h3>
                <input type="file"
                    className="border-2 border-light m-0 w-64 px-2 py-1 hover:bg-gray-800 hover:text-white" 
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files[0])}/>
                <button className="border-1 w-20 mt-5 mb-4 hover:bg-gray-400"
                    type="submit"
                    disabled={loading}
                    onClick={() => handleCreate()}>
                        {loading ? "Loading..." : "DONE"}
                </button>
                </div>
            </div>
            </main>
            {/* <Example /> */}

            <Footer />
        </div>
    
  )
}

export default Home