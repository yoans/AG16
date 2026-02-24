import React,{Component} from 'react';
import ArrowGrid from './arrow-grid';
import './App.css';

// import firebase from 'firebase';
class App extends Component {
  constructor(props){
    super(props)
    this.state = {}
  }

  render() {
    return (
      <div className="App">
        <ArrowGrid/>
      </div>
    );
  };
}

export default App;
