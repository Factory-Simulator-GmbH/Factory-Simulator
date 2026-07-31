# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

FROM deps AS dev
EXPOSE 4200
CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--port", "4200"]

FROM deps AS build
RUN npm run build -- --configuration=production

FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist/factory-simulator/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]