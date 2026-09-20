function Header() {
    return (
        <div className="flex flex-col items-center justify-center mb-8 relative">
            <span className="absolute top-0 left-0 p-5"><img src="/cap1.png" width={40} className="opacity-80 grayscale"/></span>
            <h1 className="text-center tracking-[-0.15em] w-full text-5xl sm:text-6xl lg:text-7xl pt-5 sm:pt-3 font-mono font-bold text-black">ressist</h1>
        </div>
        
        
    );
}

export default Header;