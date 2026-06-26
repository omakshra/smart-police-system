import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api";

const EMPTY_FORM = {
  category: "",
  description: "",
  latitude: "",
  longitude: "",
  grid_id: "",
};

const CrimeTable = ({ token, refreshCrimes }) => {
  const [crimes, setCrimes] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null); // store id separately, never in form
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // ── Auth error handler ───────────────────────────────────────────────────────
  const handle401 = useCallback(() => {
    localStorage.removeItem("user");
    window.location.href = "/login";
  }, []);

  // ── Fetch crimes ─────────────────────────────────────────────────────────────
  const fetchCrimes = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/crimes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCrimes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Fetch failed:", err.response || err);
      if (err.response?.status === 401) handle401();
    }
  }, [token, handle401]);

  useEffect(() => {
    if (token) fetchCrimes();
  }, [token, fetchCrimes]);

  // ── Form helpers ─────────────────────────────────────────────────────────────
  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  // Only copy the fields the backend expects — never copy id/user_id/date
  const handleEdit = (crime) => {
    setForm({
      category: crime.category ?? "",
      description: crime.description ?? "",
      latitude: crime.latitude ?? "",
      longitude: crime.longitude ?? "",
      grid_id: crime.grid_id ?? "",
    });
    setEditingId(crime.id); // keep id out of the form entirely
  };

  // ── Submit (add or update) ───────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Build a clean payload — only the fields CrimeIn expects
    const payload = {
      category: form.category,
      description: form.description,
      latitude: parseFloat(form.latitude),   // backend expects float
      longitude: parseFloat(form.longitude), // backend expects float
      grid_id: form.grid_id,
    };

    try {
      if (editingId !== null) {
        await axios.put(`${API_BASE_URL}/crimes/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${API_BASE_URL}/crimes`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      resetForm();
      fetchCrimes();
      refreshCrimes?.();
    } catch (err) {
      console.error("Submit failed:", err.response || err);
      if (err.response?.status === 401) handle401();
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      await axios.delete(`${API_BASE_URL}/crimes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // If we were editing this record, clear the form
      if (editingId === id) resetForm();
      fetchCrimes();
      refreshCrimes?.();
    } catch (err) {
      console.error("Delete failed:", err.response || err);
      if (err.response?.status === 401) handle401();
    }
  };

  // ── Filtering & pagination ───────────────────────────────────────────────────
  const filteredCrimes = crimes.filter((c) => {
    const matchesSearch =
      c.category.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory ? c.category === filterCategory : true;
    const crimeDate = new Date(c.date);
    const matchesDateFrom = filterDateFrom
      ? crimeDate >= new Date(filterDateFrom)
      : true;
    const matchesDateTo = filterDateTo
      ? crimeDate <= new Date(filterDateTo)
      : true;
    return matchesSearch && matchesCategory && matchesDateFrom && matchesDateTo;
  });

  const totalPages = Math.ceil(filteredCrimes.length / itemsPerPage);
  const paginatedCrimes = filteredCrimes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white shadow rounded p-4">
      <h3 className="mb-2 font-semibold text-gray-700">Your Crime Records</h3>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:space-x-2 mb-2 space-y-2 md:space-y-0">
        <input
          type="text"
          placeholder="Search by category or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded flex-1"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="">All Categories</option>
          <option value="Theft">Theft</option>
          <option value="Assault">Assault</option>
          <option value="Robbery">Robbery</option>
        </select>
        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className="border p-2 rounded"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="border p-2 rounded"
        />
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-96">
        <table className="table-auto w-full border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-1 border">Category</th>
              <th className="px-2 py-1 border">Description</th>
              <th className="px-2 py-1 border">Date</th>
              <th className="px-2 py-1 border">Latitude</th>
              <th className="px-2 py-1 border">Longitude</th>
              <th className="px-2 py-1 border">Grid</th>
              <th className="px-2 py-1 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCrimes.map((crime) => (
              <tr
                key={crime.id}
                className={editingId === crime.id ? "bg-yellow-50" : ""}
              >
                <td className="px-2 py-1 border">{crime.category}</td>
                <td className="px-2 py-1 border">{crime.description}</td>
                <td className="px-2 py-1 border">
                  {new Date(crime.date).toLocaleString()}
                </td>
                <td className="px-2 py-1 border">{crime.latitude}</td>
                <td className="px-2 py-1 border">{crime.longitude}</td>
                <td className="px-2 py-1 border">{crime.grid_id}</td>
                <td className="px-2 py-1 border space-x-1">
                  <button
                    className="bg-yellow-400 text-white px-2 py-1 rounded"
                    onClick={() => handleEdit(crime)}
                  >
                    Edit
                  </button>
                  <button
                    className="bg-red-600 text-white px-2 py-1 rounded"
                    onClick={() => handleDelete(crime.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center mt-2 space-x-2">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i + 1)}
            className={`px-3 py-1 border rounded ${
              currentPage === i + 1 ? "bg-blue-600 text-white" : ""
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Form */}
      <form
        className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2"
        onSubmit={handleSubmit}
      >
        {editingId !== null && (
          <p className="col-span-2 text-sm text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
            Editing record #{editingId} —{" "}
            <button
              type="button"
              onClick={resetForm}
              className="underline text-blue-600"
            >
              Cancel
            </button>
          </p>
        )}
        <input
          type="text"
          name="category"
          placeholder="Category"
          value={form.category}
          onChange={handleChange}
          required
          className="border p-2 rounded"
        />
        <input
          type="text"
          name="description"
          placeholder="Description"
          value={form.description}
          onChange={handleChange}
          required
          className="border p-2 rounded"
        />
        <input
          type="number"
          name="latitude"
          placeholder="Latitude"
          value={form.latitude}
          onChange={handleChange}
          className="border p-2 rounded"
        />
        <input
          type="number"
          name="longitude"
          placeholder="Longitude"
          value={form.longitude}
          onChange={handleChange}
          className="border p-2 rounded"
        />
        <input
          type="text"
          name="grid_id"
          placeholder="Grid ID"
          value={form.grid_id}
          onChange={handleChange}
          className="border p-2 rounded"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
          {editingId !== null ? "Update Record" : "Add Record"}
        </button>
      </form>
    </div>
  );
};

export default CrimeTable;