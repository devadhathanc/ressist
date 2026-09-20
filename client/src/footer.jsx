import { Link } from "react-router-dom";

function Footer(){
    return (
        <footer className="mt-auto mb-4">
            <h1 className="text-center text-xs font-mono text-gray-400 tracking-widest">
                <Link to="/about" className="hover:text-black transition-colors">about.</Link>
            </h1>
        </footer>
    )
}

export default Footer;