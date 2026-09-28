const stats = [
  { value: '10+', label: 'Năm trên thị trường' },
  { value: '$12m', label: 'Doanh thu hàng năm' },
  { value: '2600k+', label: 'Đối tác toàn cầu' },
  { value: '180000+', label: 'Sản phẩm bán ra' },
];

const Stats = () => {
  return (
    <section className="mx-auto my-10 grid max-w-7xl grid-cols-1 gap-y-8 px-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col items-center">
          <h3 className="text-5xl font-extrabold leading-tight">{stat.value}</h3>
          <p className="text-base font-medium leading-7 text-body dark:text-store-muted">{stat.label}</p>
        </div>
      ))}
    </section>
  );
};

export default Stats;
