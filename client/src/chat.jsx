import React from "react"; 
import { useLocation } from "react-router";

function Chat() {
    const location = useLocation();
    const title = location.state.title;

    return (
        <div>
            <h1 className="text-center w-full text-3xl sm:text-5xl lg:text-7xl pt-5 sm:pt-3 font-mono">{title}</h1>
            <h3 className="text-start style-itallic mx-5">Session - {location.state.session_id}</h3>
            <h3 className="text-end mx-5">{location.state.creation_date}</h3>
        </div>
    )
}

export default Chat