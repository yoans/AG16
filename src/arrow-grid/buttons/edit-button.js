import React from 'react';
import {EditIcon} from './icons';
export const EditButton = ({onClick, isEditing, className}) => (
    <button
        title="Change Draw Mode"
        className={"EditButton isEnabled"} onClick={onClick}>
        <EditIcon className={className}></EditIcon>
    </button>
)
// + (isEditing ? " ActiveControl":"")