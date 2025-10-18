import { Link } from "react-router-dom";

function Footer(){
    return (
        <footer className="mt-auto mb-4">
            <h1 className="text-center text-sm">
                <Link to="/about" className="hover:underline">about.</Link>
            </h1>
        </footer>
    )
}

export default Footer;