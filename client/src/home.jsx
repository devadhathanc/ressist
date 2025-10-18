import { useNavigate } from "react-router-dom";
import React from "react";
import Footer from "./footer.jsx"
import Header from "./header.jsx"

import Example from "./example.jsx"

function Home() {
    const navigate = useNavigate();
    const [key, setKey] = React.useState();
    const keys = [1234, 5678, 91011];

    const[doi, setDoi] = React.useState("10.1038/s41598-025-19951-2");
    const [file, setFile] = React.useState(null);

    function handlekey(e){
        setKey(e.target.value);
    }
    function handleSubmit(){
        console.log(key);
        if(keys.includes(Number(key))){
            navigate("/chat");
        }else{
            alert(Number(key) + " is not a valid key" );
        }
    }
    async function handleCreate() {
            const formData = new FormData();
            formData.append('doi', doi);
            formData.append('file', file);
            const res = await fetch("http://localhost:8080/api/create-session", {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            navigate("/chat" , {state:{title : "Session Chat", session_id :data.session_id, creation_date : data.creation_date}});
    }
    
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow">
            <div className="flex sm:flex-row flex-col justify-center m-4 gap-8">
                <div className="flex flex-col items-center px-2 border-2 border-black">
                <h1 className="text-center mb-2 underline font-[600]"> session-key</h1>
                <input type="number" className="border-2 border-light " value={key} onChange={handlekey} placeholder=" enter the key"/>
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
                    onClick={() => handleCreate()}>
                        DONE
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