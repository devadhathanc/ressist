import { useNavigate } from "react-router-dom";

function About(){
    const navigate = useNavigate();
    return(
        <div className="min-h-screen flex flex-col items-center">
            <img src="cap1.png" className="h-24 absolute" onClick={() =>  navigate("/")}/>
            <div className="flex flex-col md:flex-row justify-center items-center flex-1">
                <p className="text-2xl font-mono font-bold relative md:left-20 md:top-1">A</p>
                <img src="signature.png" />
                <p className="text-2xl relative  font-sans font-bold md:top-1 md:right-20">Project</p>
            </div>
        </div>
    )
}
export default About;