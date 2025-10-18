import React, {useState} from "react";

// const cars= ["BMW", "Audi", "Mercedes"];


function Example() {

    const [cars,setCars] = useState([]);
    const [carYear,setYear] = useState(new Date().getFullYear());
    const [carMake,setMake] = useState("");
    const [carModel,setModel] = useState("");
    function handleAddCar(){
        const newCar = {year: carYear, make: carMake, model: carModel};
        setCars(c => ([...c,newCar]));
        
    }
    function handleRemoveCar(index){
        setCars(cars.filter((_,i) => i!==index));
    }

    function handleYearChange(e){
        setYear(e.target.value);
    }

    function handleMakeChange(e){
        setMake(e.target.value);
    }

    function handleModelChange(e){
        setModel(e.target.value);
    }

    return(
        <>
            <h1>Cars</h1>
            <ol>
                {cars.map((car,index) => (
                    <li key={index} onClick={() => handleRemoveCar(index)}>{car.year} {car.make} {car.model}</li>
                ))}
            </ol>
            <input type= "number" placeholder="Year" onChange={handleYearChange}/>
            <input type= "text" placeholder="Make" onChange={handleMakeChange}/>
            <input type= "text" placeholder="Model" onChange={handleModelChange}/>
            <button onClick={handleAddCar}>AddCar</button>
        </>
        
    )
}

export default Example