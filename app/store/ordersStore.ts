import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export type OrderItem = {
  productId: number;
  quantity: number;
  name: { fr: string; en: string };
  price: string;
  image: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  userId: string;
};

type OrdersStore = {
  orders: Order[];
  addOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'date'>) => void;
  getOrdersByUser: (userId: string) => Order[];
  getOrderById: (orderId: string) => Order | undefined;
  deleteOrdersByUser: (userId: string) => void;
};

// Générer un numéro de commande
const generateOrderNumber = (): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `PH-${timestamp}-${random}`;
};

export const useOrdersStore = create<OrdersStore>()(
  persist(
    (set, get) => ({
      orders: [],
      
      addOrder: (orderData) => {
        const newOrder: Order = {
          ...orderData,
          id: `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          orderNumber: generateOrderNumber(),
          date: new Date().toISOString(),
        };
        
        set({
          orders: [newOrder, ...get().orders],
        });
      },
      
      getOrdersByUser: (userId) => {
        return get().orders
          .filter(order => order.userId === userId)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      },
      
      getOrderById: (orderId) => {
        return get().orders.find(order => order.id === orderId);
      },
      
      deleteOrdersByUser: (userId) => {
        set({
          orders: get().orders.filter(order => order.userId !== userId),
        });
      },
    }),
    {
      name: 'orders-storage',
    }
  )
);
