import React from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

const CrimeChart = ({ prediction }) => {
  // Only individual crimes, no "total crimes"
  const crimeCounts = prediction.predicted_counts;

  // If there are no crimes, display empty chart
  if (!crimeCounts || Object.keys(crimeCounts).length === 0) {
    return <p>No crime data available for chart.</p>;
  }

  const labels = Object.keys(crimeCounts).map((key) =>
    key.replace(/_/g, " ")
  );

  const data = {
    labels: labels,
    datasets: [
      {
        data: Object.values(crimeCounts),
        backgroundColor: [
          "#4dc9f6",
          "#f67019",
          "#f53794",
          "#537bc4",
          "#acc236",
          "#166a8f",
          "#00a950",
          "#8549ba",
          "#ff6384",
          "#36a2eb",
        ].slice(0, labels.length), // ensure only enough colors
        hoverOffset: 15,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "right",
        labels: {
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: function (tooltipItem) {
            const value = tooltipItem.raw;
            const total = Object.values(crimeCounts).reduce(
              (acc, v) => acc + v,
              0
            );
            const percentage = ((value / total) * 100).toFixed(1);
            return `${tooltipItem.label}: ${value} (${percentage}%)`;
          },
        },
      },
    },
  };

  return <Pie data={data} options={options} />;
};

export default CrimeChart;
