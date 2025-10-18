import React from "react"; 
import { useLocation } from "react-router";

function Chat() {
    // const [SessionKey, setSessionKey] = React.useState("Loading...");
    const location = useLocation();
    const title = location.state.title;
    // async function fetchSessionKey() {
    //     const res = await fetch("http://localhost:8080/api/create-session", {
    //         method: 'GET',
    //     });
    //     const data = await res.json();
    //     return data.session_id;
    // }
    // React.useEffect(() => {
    //     fetchSessionKey().then((key) => setSessionKey(key));
    // }, []);

    return (
        <div>
            <h1 className="text-center w-full text-3xl sm:text-5xl lg:text-7xl pt-5 sm:pt-3 font-mono">{title}</h1>
            <h3 className="text-start style-itallic">Session - {location.state.session_id}</h3>
            <h3 className="text-end">{location.state.creation_date}</h3>
        </div>
    )
}

export default Chat