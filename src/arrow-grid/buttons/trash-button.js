import React from 'react';
import {TrashIcon} from './icons';
export const TrashButton = ({onClick}) => (
    <button 
        title="Clear Grid"
        className="TrashButton isEnabled" onClick={onClick}
    >
        <TrashIcon></TrashIcon>
    </button>
)