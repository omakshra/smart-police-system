const Card = ({ title, value }) => {
  return (
    <div className="bg-white shadow rounded p-4">
      <h3 className="text-gray-500 font-medium">{title}</h3>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  );
};

export default Card;
