import React, {useState} from "react";

// const csubs= ["BMW", "Audi", "Mercedes"];


function Example() {

    const [csubs,setCsubs] = useState([]);
    const [csubYesub,setYesub] = useState(new Date().getFullYesub());
    const [csubMake,setMake] = useState("");
    const [csubModel,setModel] = useState("");
    function handleAddCsub(){
        const newCsub = {yesub: csubYesub, make: csubMake, model: csubModel};
        setCsubs(c => ([...c,newCsub]));
        
    }
    function handleRemoveCsub(index){
        setCsubs(csubs.filter((_,i) => i!==index));
    }

    function handleYesubChange(e){
        setYesub(e.tsubget.value);
    }

    function handleMakeChange(e){
        setMake(e.tsubget.value);
    }

    function handleModelChange(e){
        setModel(e.tsubget.value);
    }

    return(
        <>
            <h1>Csubs</h1>
            <ol>
                {csubs.map((csub,index) => (
                    <li key={index} onClick={() => handleRemoveCsub(index)}>{csub.yesub} {csub.make} {csub.model}</li>
                ))}
            </ol>
            <input type= "number" placeholder="Yesub" onChange={handleYesubChange}/>
            <input type= "text" placeholder="Make" onChange={handleMakeChange}/>
            <input type= "text" placeholder="Model" onChange={handleModelChange}/>
            <button onClick={handleAddCsub}>AddCsub</button>
        </>
        
    )
}

export default Example
