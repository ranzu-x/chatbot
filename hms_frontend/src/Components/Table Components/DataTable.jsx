// src/components/Table/DataTable.jsx
import Pagination from "./Pagination";
import SearchBar from "./SearchBar";

const DataTable = ({
    title,
    columns,
    data,
    loading,
    searchTerm,
    setSearchTerm,
    onAddNew,
    currentPage,
    totalPages,
    onPageChange,
    actions,
}) => {
    return (
        <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow overflow-hidden border border-white border-opacity-60">
            {/* Header Section */}
            <div className="mt-4 flex flex-col sm:flex-row justify-between items-center p-5">
                <SearchBar
                    placeholder={`Search ${title.toLowerCase()}...`}
                    value={searchTerm}
                    onChange={setSearchTerm}
                />
                {onAddNew && (
                    <button
                        onClick={onAddNew}
                        className="w-full sm:w-auto px-8 py-3 bg-indigo-500 text-white font-semibold rounded-full shadow-lg hover:bg-indigo-600 focus:ring-2 focus:ring-indigo-400 transition-all duration-300 flex items-center gap-2"
                    >
                        <span className="text-lg">＋</span>
                        <span>Add New {title}</span>
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full text-center">
                    <thead className="bg-gray-200 text-black shadow-md">
                        <tr>
                            {columns.map((col, i) => (
                                <th
                                    key={i}
                                    className="p-4 text-sm font-bold tracking-wide uppercase"
                                >
                                    {col.header}
                                </th>
                            ))}
                            {actions && (
                                <th className="p-4 text-sm font-bold uppercase">Actions</th>
                            )}
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td
                                    colSpan={columns.length + (actions ? 1 : 0)}
                                    className="py-10 text-indigo-600 text-xl animate-pulse"
                                >
                                    Loading {title.toLowerCase()}...
                                </td>
                            </tr>
                        ) : data && data.length > 0 ? (
                            data.map((item, rowIndex) => (
                                <tr
                                    key={item.id || rowIndex}
                                    className="even:bg-gray-50 odd:bg-white hover:bg-indigo-50 transition"
                                >
                                    {columns.map((col, colIndex) => (
                                        <td key={colIndex} className="p-4 text-gray-800">
                                            {col.render
                                                ? col.render(item, rowIndex)
                                                : item[col.accessor] ?? ""}
                                        </td>
                                    ))}
                                    {actions && (
                                        <td className="p-4 text-center">{actions(item)}</td>
                                    )}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td
                                    colSpan={columns.length + (actions ? 1 : 0)}
                                    className="text-center py-10 text-gray-500 text-lg"
                                >
                                    No {title.toLowerCase()} found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                />
            )}
        </div>
    );
};

export default DataTable;
