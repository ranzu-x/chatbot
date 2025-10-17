// src/components/Table/SearchBar.jsx
import React from "react";

const SearchBar = ({ placeholder, value, onChange }) => (
  <div className="relative w-full sm:w-80">
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-full bg-gray-50 focus:ring-2 focus:ring-indigo-400"
    />
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
    </svg>
  </div>
);

export default SearchBar;
