import React from 'react';
import {ArrowIcon} from './icons';
export const ArrowButton = ({onClick, direction, number}) => (
    <button 
        title="Change Arrow Direction"
        className={"ArrowButton isEnabled"} onClick={onClick}>
        <div className={"number-overlayee"}>
            <ArrowIcon direction={direction}></ArrowIcon>
            <div className={'number-overlay'}>
                {/* <h4>{number}</h4> */}
            </div>
        </div>
    </button>
)