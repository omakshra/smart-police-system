const Navbar = () => {
  return (
    <header className="bg-white shadow px-6 py-4 flex justify-between items-center">
      <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
      <div className="flex items-center gap-4">
        <span className="text-gray-600">Admin</span>
        <img
          src="https://via.placeholder.com/32"
          alt="User Avatar"
          className="rounded-full"
        />
      </div>
    </header>
  );
};

export default Navbar;
